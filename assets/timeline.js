(function () {
  "use strict";
  const T = window.TIMELINE;
  if (!T) return;
  const EVENTS = T.events.slice().sort((a, b) => a.year - b.year || a.date.localeCompare(b.date));
  const ERAS = T.eras;
  const eraMap = Object.fromEntries(ERAS.map(e => [e.id, e]));
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let activeEra = "all";
  let query = "";

  function filtered() {
    const q = query.trim().toLowerCase();
    return EVENTS.filter(e => {
      if (activeEra !== "all" && e.era !== activeEra) return false;
      if (!q) return true;
      return (e.title + " " + e.summary + " " + e.date).toLowerCase().includes(q);
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
        parts.push(`<article class="tevent" style="--era:${era.color}" data-id="${esc(e.id)}">
          <div class="tdate"><b>${esc(y)}</b>${md ? "." + esc(md) : ""}</div>
          <div class="tcard">
            <h3>${esc(e.title)}</h3>
            <p>${esc(e.summary)}</p>
            <div class="tlinks">${links}${bank}</div>
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
