(async function () {
  "use strict";
  if (!window.VOCAB) {
    try {
      await new Promise((res, rej) => {
        const sc = document.createElement("script");
        sc.src = "assets/vocab-data.js?v=2";
        sc.onload = res;
        sc.onerror = () => rej(new Error("词库加载失败"));
        document.head.appendChild(sc);
      });
    } catch (e) { document.body.textContent = e.message + "，请检查网络后刷新。"; return; }
  }
  const V = window.VOCAB;
  if (!V) return;
  const WORDS = V.words;
  const TOPICS = V.topics || [];
  const TOTAL = V.meta.total;
  const KEY = "atlas.vocab.v1";

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const lower = w => String(w).toLowerCase();
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------------- state ---------------- */
  const fallback = { rec: {}, star: {}, days: {}, tts: true };
  let initial;
  try { await window.AtlasUser.ready; initial = await window.AtlasUser.load("vocab", fallback); }
  catch (e) { document.body.textContent = "词汇记录加载失败：" + e.message + "。请检查网络后刷新。"; return; }
  const S = Object.assign({}, fallback, initial || {});
  const legacy = localStorage.getItem(KEY);
  if (legacy) {
    const button = document.createElement("button"); button.className = "vghost"; button.textContent = "导入此浏览器的旧词汇记录";
    document.querySelector(".vhero").appendChild(button);
    button.addEventListener("click", async () => {
      if (!confirm("旧记录没有账号归属。确认将其导入当前账号？")) return;
      try { const data = JSON.parse(legacy); if (!data || !data.rec) throw Error("旧记录格式无效"); for (const key of ["rec", "star", "days"]) S[key] = Object.assign({}, data[key] || {}, S[key] || {}); await window.AtlasUser.save("vocab", S); button.remove(); init(); toast("旧记录已导入"); }
      catch (e) { toast("导入失败：" + e.message); }
    });
  }
  const DEFAULT_KEYS = { known: "ArrowLeft", fuzzy: " ", unknown: "ArrowRight", reveal: "Enter", speak: "s", next: "Enter" };
  S.keys = Object.assign({}, DEFAULT_KEYS, S.keys || {});
  let saveTimer = 0, savePending = false;
  function flushSave() { if (!savePending) return; savePending = false; clearTimeout(saveTimer); window.AtlasUser.save("vocab", S).catch(e => toast("同步失败：" + e.message)); }
  function save() { savePending = true; clearTimeout(saveTimer); saveTimer = setTimeout(flushSave, 600); }
  window.addEventListener("pagehide", flushSave);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSave(); });
  const fmtDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = () => fmtDate(new Date());
  const recOf = w => S.rec[lower(w)] || null;
  const isKnown = w => { const r = recOf(w); return !!r && r.l >= 3; };
  const isStar = w => !!S.star[lower(w)];

  function streak() {
    let n = 0;
    const d = new Date();
    if (!S.days[today()]) d.setDate(d.getDate() - 1);
    while (S.days[fmtDate(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function updateStats() {
    const known = WORDS.filter(w => isKnown(w.w)).length;
    const star = Object.keys(S.star).length;
    const t = S.days[today()] || 0;
    $("#vstats").innerHTML = `已掌握 <b>${known}</b> · 生词 <b>${star}</b> · 今日 <b>${t}</b>`;
    const pct = TOTAL ? (known / TOTAL * 100) : 0;
    $("#vprogBar").style.width = pct.toFixed(2) + "%";
    $("#vprogText").textContent = `已掌握 ${known} / ${TOTAL} · 连续 ${streak()} 天`;
  }

  /* ---------------- tts ---------------- */
  function speak(word) {
    if (!S.tts || !window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(String(word));
      u.lang = "en-US";
      u.rate = 0.92;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }
  const SPK = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 6v4h2l3 3V3L5 6H3z" fill="currentColor"/><path d="M11 5.5c1 .8 1 4.2 0 5" stroke="currentColor" fill="none" stroke-width="1.2" stroke-linecap="round"/></svg>';

  function keyLabel(key) {
    if (!key) return "未设置";
    if (key === " ") return "Space";
    if (key === "ArrowLeft") return "←";
    if (key === "ArrowRight") return "→";
    if (key === "ArrowUp") return "↑";
    if (key === "ArrowDown") return "↓";
    if (key === "Enter") return "Enter";
    if (key === "Escape") return "Esc";
    return key.length === 1 ? key.toUpperCase() : key;
  }
  function keyMatch(e, action) {
    const k = S.keys[action];
    if (!k) return false;
    const pressed = e.key === " " ? " " : (e.key.length === 1 ? e.key.toLowerCase() : e.key);
    return pressed === k;
  }

  /* ---------------- toast ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $("#vtoast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  /* ---------------- grade ---------------- */
  function grade(word, level, assisted = false) {
    const k = lower(word);
    const r = S.rec[k] || { l: 0, d: 0, seen: 0, ok: 0, w: 0 };
    r.seen += 1;
    if (level === "known" && !assisted) { r.ok += 1; r.l = Math.min(5, (r.l || 0) + 1); }
    else if (level === "known") { r.assisted = (r.assisted || 0) + 1; r.l = Math.max(1, r.l || 0); }
    else if (level === "fuzzy") { r.l = Math.max(1, r.l || 0); }
    else { r.l = 0; r.w = (r.w || 0) + 1; }
    const days = [0, 1, 2, 4, 7, 15][r.l] || 15;
    r.d = Date.now() + days * 86400000;
    S.rec[k] = r;
    S.days[today()] = (S.days[today()] || 0) + 1;
    save();
    updateStats();
  }
  function toggleStar(word) {
    const k = lower(word);
    if (S.star[k]) delete S.star[k]; else S.star[k] = 1;
    save();
    updateStats();
    return !!S.star[k];
  }

  /* ---------------- tabs ---------------- */
  function showTab(id) {
    $$(".vtabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === id));
    $$(".vpanel").forEach(p => p.classList.toggle("active", p.id === "tab-" + id));
    if (id === "book") renderBook();
    if (id === "test" && T.queue.length === 0 && $("#vresult").hidden === false) {
      $("#vresult").hidden = true;
      $("#vsetup").hidden = false;
    }
    if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }
  $$(".vtabs button").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));

  /* ---------------- list ---------------- */
  const listState = { f: "all", q: "", sort: "exam", letter: "", limit: 80 };
  const cmp = {
    freq: (a, b) => b.f - a.f || a.w.localeCompare(b.w),
    score: (a, b) => b.s - a.s || b.f - a.f,
    exam: (a, b) => b.z - a.z || b.f - a.f,
    alpha: (a, b) => a.w.localeCompare(b.w),
  };

  function filtered() {
    const q = listState.q.trim().toLowerCase();
    return WORDS.filter(w => {
      if (listState.letter && !w.w.toLowerCase().startsWith(listState.letter)) return false;
      if (q && !(w.w.toLowerCase().includes(q) || (w.m || "").includes(q))) return false;
      const r = recOf(w.w);
      switch (listState.f) {
        case "high": return w.f >= 40;
        case "exam": return w.z > 0;
        case "acad": return !!w.a;
        case "adv": return !!w.v;
        case "new": return !r || r.l < 1;
        case "known": return !!r && r.l >= 3;
        case "star": return isStar(w.w);
        default: return true;
      }
    }).sort(cmp[listState.sort] || cmp.freq);
  }

  function rowHtml(w) {
    const k = lower(w.w);
    const known = isKnown(w.w);
    const star = isStar(w.w);
    return `<div class="vrow${known ? " known" : ""}" data-w="${esc(w.w)}">
      <button class="vspeak" data-speak="${esc(w.w)}" aria-label="发音">${SPK}</button>
      <div class="vw"><b>${esc(w.w)}</b>${w.alt ? `<span class="valt">${esc(w.alt)}</span>` : ""}${w.e ? `<span class="vcefr">${esc(w.e)}</span>` : ""}</div>
      <div class="vm">${esc(w.m)}${w.n ? `<i class="vnote">${esc(w.n)}</i>` : ""}
        ${w.ex ? `<details class="vex"><summary title="真题例句">例</summary><p>${esc(w.ex)}</p><p class="excn">${esc(w.exCn || "")}</p><small>${esc(w.exSrc || "")}</small></details>` : ""}
      </div>
      <div class="vb">${w.z ? `<span class="vb-exam">真题 ${w.z}</span>` : ""}${w.a ? `<span>学术</span>` : ""}${w.v ? `<span>高级</span>` : ""}</div>
      <div class="va">
        <button data-grade="known">认识</button>
        <button data-grade="unknown">不认识</button>
        <button data-star class="${star ? "on" : ""}" aria-label="生词本">${star ? "★" : "☆"}</button>
      </div>
    </div>`;
  }

  function renderList() {
    const rows = filtered();
    const slice = rows.slice(0, listState.limit);
    $("#vlist").innerHTML = slice.map(rowHtml).join("");
    $("#vcount").textContent = `当前 ${rows.length} 词 · 显示 ${slice.length}`;
    $("#vmore").hidden = slice.length >= rows.length;
  }

  $("#vsearch").addEventListener("input", e => {
    clearTimeout(window.__vsearchT);
    window.__vsearchT = setTimeout(() => { listState.q = e.target.value; listState.limit = 80; renderList(); }, 120);
  });
  $("#vsort").addEventListener("change", e => { listState.sort = e.target.value; renderList(); });
  $("#vchips").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    listState.f = b.dataset.f; listState.limit = 80;
    $$("#vchips button").forEach(x => x.classList.toggle("on", x === b));
    renderList();
  });
  $("#vmore").addEventListener("click", () => { listState.limit += 80; renderList(); });

  const letters = ["", ..."abcdefghijklmnopqrstuvwxyz".split("")];
  $("#valpha").innerHTML = letters.map(L => `<button data-letter="${L}" class="${L === "" ? "on" : ""}">${L === "" ? "全部" : L.toUpperCase()}</button>`).join("");
  $("#valpha").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    listState.letter = b.dataset.letter; listState.limit = 80;
    $$("#valpha button").forEach(x => x.classList.toggle("on", x === b));
    renderList();
  });

  $("#vlist").addEventListener("click", e => {
    const speakBtn = e.target.closest("[data-speak]");
    if (speakBtn) { speak(speakBtn.dataset.speak); return; }
    const g = e.target.closest("[data-grade]");
    if (g) {
      const row = g.closest(".vrow");
      grade(row.dataset.w, g.dataset.grade);
      row.classList.toggle("known", g.dataset.grade === "known" ? true : isKnown(row.dataset.w));
      toast(g.dataset.grade === "known" ? "已标记认识" : "已加入错词");
      return;
    }
    const st = e.target.closest("[data-star]");
    if (st) {
      const row = st.closest(".vrow");
      const on = toggleStar(row.dataset.w);
      st.classList.toggle("on", on);
      st.textContent = on ? "★" : "☆";
      toast(on ? "已收进生词本" : "已移出生词本");
    }
  });

  /* ---------------- topics ---------------- */
  function topicWordCount(t) { return (t.groups || []).reduce((n, g) => n + (g.words || []).length, 0); }

  function renderTopicGrid() {
    $("#vtopicGrid").innerHTML = TOPICS.map(t => `
      <button class="vtcard" data-topic="${esc(t.id)}">
        <div class="vtk">${esc((t.id || "").toUpperCase())}</div>
        <h2>${esc(t.title)}</h2>
        <p>${esc(t.intro)}</p>
        <div class="vtm">${(t.groups || []).length} 组 · ${topicWordCount(t)} 词</div>
      </button>`).join("");
  }

  function topicWords(t) {
    const out = [];
    (t.groups || []).forEach(g => (g.words || []).forEach(w => out.push({ w: w.w, m: w.m, note: w.note || "", group: g.name })));
    return out;
  }

  function openTopic(id) {
    const t = TOPICS.find(x => x.id === id);
    if (!t) return;
    $("#vtopicGrid").hidden = true;
    const detail = $("#vtopicDetail");
    detail.hidden = false;
    detail.innerHTML = `
      <button class="vtback" id="vtback">← 返回专题</button>
      <div class="vtd-head">
        <div class="vkicker">TOPIC</div>
        <h1>${esc(t.title)}</h1>
        <p>${esc(t.intro)}</p>
      </div>
      ${(t.groups || []).map(g => `
        <section class="vgroup">
          <h3>${esc(g.name)}</h3>
          ${g.note ? `<p class="vgnote">${esc(g.note)}</p>` : ""}
          <div class="vgwords">
            ${(g.words || []).map(w => `
              <div class="vgword">
                <button class="vspeak" data-speak="${esc(w.w)}">${SPK}</button>
                <div><b>${esc(w.w)}</b><div class="vgm">${esc(w.m)}</div></div>
                <div class="vgn">${esc(w.note || "")}</div>
              </div>`).join("")}
          </div>
        </section>`).join("")}
      <div class="vtd-actions">
        <button class="vprimary" data-topic-test="${esc(t.id)}">测这组 · 20 词</button>
        <button class="vghost" id="vtback2">返回专题</button>
      </div>`;
    detail.scrollIntoView({ block: "start" });
  }

  $("#vtopicGrid").addEventListener("click", e => {
    const card = e.target.closest("[data-topic]");
    if (card) openTopic(card.dataset.topic);
  });
  $("#vtopicDetail").addEventListener("click", e => {
    if (e.target.closest("#vtback") || e.target.closest("#vtback2")) {
      $("#vtopicDetail").hidden = true;
      $("#vtopicGrid").hidden = false;
      return;
    }
    const speakBtn = e.target.closest("[data-speak]");
    if (speakBtn) { speak(speakBtn.dataset.speak); return; }
    const testBtn = e.target.closest("[data-topic-test]");
    if (testBtn) {
      const t = TOPICS.find(x => x.id === testBtn.dataset.topicTest);
      const list = topicWords(t);
      startTest("topic", "card", Math.min(20, list.length), list);
    }
  });

  /* ---------------- test ---------------- */
  const T = { queue: [], i: 0, correct: 0, assisted: 0, wrong: [], mode: "card", pool: "high", revealed: false, answered: false, current: null, started: false };
  let mode = "card", count = 20;

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function poolWords(pool) {
    if (pool === "all") return WORDS.slice();
    if (pool === "high") return WORDS.filter(w => w.f >= 40);
    if (pool === "exam") return WORDS.filter(w => w.z > 0).sort((a, b) => b.z - a.z);
    if (pool === "star") return WORDS.filter(w => isStar(w.w));
    if (pool === "wrong") return WORDS.filter(w => { const r = recOf(w.w); return !!r && (r.w || 0) > 0; });
    if (pool === "due") {
      const now = Date.now();
      return WORDS.filter(w => {
        const r = recOf(w.w);
        return !r || (r.d <= now && (r.l || 0) < 5);
      });
    }
    return WORDS.slice();
  }

  function buildQueue(pool, n, preset) {
    let list = preset ? preset.slice() : poolWords(pool).slice();
    const now = Date.now();
    const due = [], fresh = [], later = [];
    list.forEach(w => {
      const r = recOf(w.w);
      if (r && (r.d || 0) <= now && (r.l || 0) < 5) due.push(w);
      else if (!r) fresh.push(w);
      else later.push(w);
    });
    shuffle(due); shuffle(fresh); shuffle(later);
    return due.concat(fresh, later).slice(0, n);
  }

  function setMode(m) {
    mode = m;
    $$("#vmodes button").forEach(b => b.classList.toggle("on", b.dataset.mode === m));
  }
  function setCount(n) {
    count = n;
    $$("#vcounts button").forEach(b => b.classList.toggle("on", Number(b.dataset.n) === n));
  }
  $$("#vmodes button").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
  $$("#vcounts button").forEach(b => b.addEventListener("click", () => setCount(Number(b.dataset.n))));

  $("#vstart").addEventListener("click", () => {
    const pool = $("#vpool").value;
    startTest(pool, mode, count);
  });

  function startTest(pool, m, n, preset) {
    const queue = buildQueue(pool, n, preset);
    if (!queue.length) { toast("这个范围暂时没有词，换一个词库试试"); return; }
    Object.assign(T, { queue, i: 0, correct: 0, assisted: 0, wrong: [], mode: m, pool, revealed: false, answered: false, current: null, started: true });
    $("#vsetup").hidden = true;
    $("#vresult").hidden = true;
    $("#vrun").hidden = false;
    showTab("test");
    renderCard();
  }

  function currentWord() { return T.queue[T.i]; }

  function distractors(word, field, n) {
    const pool = WORDS.filter(w => w.w !== word.w && w[field] && lower(w[field]) !== lower(word[field] || ""));
    shuffle(pool);
    return pool.slice(0, n).map(w => w[field]);
  }

  function renderCard() {
    const w = currentWord();
    if (!w) return finish();
    T.current = w; T.hinted = false; $("#vhintText").hidden = true; $("#vhintText").textContent = ""; T.revealed = false; T.answered = false; T.awaitNext = false;
    const wordEl = $("#vword");
    wordEl.classList.toggle("meaning", T.mode === "spell" || T.mode === "listen");
    if (T.mode === "spell") {
      wordEl.textContent = w.m;
      $("#vsub").textContent = "根据释义拼写单词";
    } else if (T.mode === "listen") {
      wordEl.textContent = "听音选词";
      $("#vsub").textContent = "点击发音，选出你听到的单词";
    } else {
      wordEl.textContent = w.w;
      $("#vsub").textContent = [w.e, w.group, w.note].filter(Boolean).join(" · ");
    }
    $("#vfeedback").textContent = "";
    $("#vfeedback").className = "vfeedback";
    $("#vreveal").hidden = true;
    $("#vchoices").hidden = true;
    $("#vchoices").innerHTML = "";
    $("#vspellbox").hidden = true;
    $("#vnext").hidden = true;
    $("#vactions").innerHTML = "";
    $("#vrunMeta").textContent = `${T.i + 1} / ${T.queue.length} · ${({ card: "卡片", choice: "选择", spell: "拼写", listen: "听音" })[T.mode]}`;
    $("#vrunScore").textContent = `独立正确 ${T.correct} · 提示后正确 ${T.assisted}`;
    $("#vbar").style.width = (T.i / T.queue.length * 100) + "%";

    if (T.mode === "card") {
      renderGradeBar();
    } else if (T.mode === "choice") {
      const opts = shuffle([w.m, ...distractors(w, "m", 3)]);
      $("#vchoices").innerHTML = opts.map(m => `<button data-choice="${esc(m)}">${esc(m)}</button>`).join("");
      $("#vchoices").hidden = false;
    } else if (T.mode === "spell") {
      const hint = w.w.replace(/[a-z]/gi, ch => "＿");
      $("#vspellbox").hidden = false;
      $("#vspell").value = "";
      $("#vspell").placeholder = w.w.charAt(0) + "＿".repeat(Math.max(0, w.w.length - 1));
      setTimeout(() => $("#vspell").focus(), 30);
      $("#vfeedback").textContent = `${w.m} · ${hint.length} 个字符`;
    } else if (T.mode === "listen") {
      const opts = shuffle([w.w, ...distractors(w, "w", 3)]);
      $("#vchoices").innerHTML = opts.map(x => `<button data-listen="${esc(x)}">${esc(x)}</button>`).join("");
      $("#vchoices").hidden = false;
      setTimeout(() => speak(w.w), 250);
    }
  }

  function renderGradeBar() {
    $("#vactions").innerHTML = `
      <div class="vgradebar">
        <button data-grade="known"><span class="gkey">${keyLabel(S.keys.known)}</span><span>认识</span></button>
        <button data-grade="fuzzy"><span class="gkey">${keyLabel(S.keys.fuzzy)}</span><span>模糊</span></button>
        <button data-grade="unknown"><span class="gkey">${keyLabel(S.keys.unknown)}</span><span>不认识</span></button>
      </div>
      <div class="vaux">
        <button data-act="reveal">显示释义（${keyLabel(S.keys.reveal)}）</button>
        <button data-act="speak">发音（${keyLabel(S.keys.speak)}）</button>
        <button data-act="keys">自定义快捷键</button>
      </div>`;
  }

  function reveal() {
    const w = T.current; if (!w) return;
    T.revealed = true;
    if (!T.answered) T.hinted = true;
    $("#vreveal").hidden = false;
    $("#vreveal").innerHTML = `<div class="vmean">${esc(w.m)}</div>${w.ex ? `<div class="vex2">${esc(w.ex)}<small>${esc(w.exCn || "")}</small></div>` : ""}`;
  }

  function gradeCard(g) {
    if (!T.current || T.answered) return;
    T.answered = true;
    grade(T.current.w, g, T.hinted);
    if (g === "known") {
      if (T.hinted) T.assisted += 1; else T.correct += 1;
      next();
      return;
    }
    if (g === "unknown") T.wrong.push({ w: T.current.w, m: T.current.m });
    reveal();
    T.awaitNext = true;
    $("#vrunScore").textContent = `独立正确 ${T.correct} · 提示后正确 ${T.assisted}`;
    $("#vnext").hidden = false;
    $("#vnext").textContent = "下一题 →";
    $$("#vactions [data-grade]").forEach(b => { b.disabled = true; b.classList.add("done"); });
  }

  $("#vactions").addEventListener("click", e => {
    const act = e.target.closest("[data-act]");
    if (act) {
      if (act.dataset.act === "reveal") reveal();
      else if (act.dataset.act === "speak") { if (T.current) speak(T.current.w); }
      else if (act.dataset.act === "keys") openKeys();
      return;
    }
    const g = e.target.closest("[data-grade]");
    if (g) gradeCard(g.dataset.grade);
  });

  $("#vchoices").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || T.answered) return;
    T.answered = true;
    const w = T.current;
    let ok = false;
    if (T.mode === "choice") {
      ok = b.dataset.choice === w.m;
      $$("#vchoices button").forEach(x => {
        if (x.dataset.choice === w.m) x.classList.add("right");
        else if (x === b) x.classList.add("wrong");
      });
      $("#vfeedback").textContent = ok ? "正确" : `正确答案：${w.m}`;
    } else {
      ok = lower(b.dataset.listen) === lower(w.w);
      $$("#vchoices button").forEach(x => {
        if (lower(x.dataset.listen) === lower(w.w)) x.classList.add("right");
        else if (x === b) x.classList.add("wrong");
      });
      $("#vfeedback").textContent = ok ? `正确 · ${w.m}` : `正确单词：${w.w} · ${w.m}`;
    }
    $("#vfeedback").className = "vfeedback " + (ok ? "ok" : "no");
    if (ok) { if (T.hinted) T.assisted += 1; else T.correct += 1; } else T.wrong.push({ w: w.w, m: w.m });
    grade(w.w, ok ? "known" : "unknown", T.hinted);
    $("#vnext").hidden = false;
    $("#vrunScore").textContent = `独立正确 ${T.correct} · 提示后正确 ${T.assisted}`;
  });

  function submitSpell() {
    if (T.answered) { next(); return; }
    const w = T.current;
    const val = $("#vspell").value.trim().toLowerCase();
    if (!val) return;
    T.answered = true;
    const ok = val === lower(w.w);
    $("#vfeedback").className = "vfeedback " + (ok ? "ok" : "no");
    $("#vfeedback").textContent = ok ? "拼写正确" : `正确拼写：${w.w}`;
    if (ok) { if (T.hinted) T.assisted += 1; else T.correct += 1; } else T.wrong.push({ w: w.w, m: w.m });
    grade(w.w, ok ? "known" : "unknown", T.hinted);
    $("#vnext").hidden = false;
    $("#vrunScore").textContent = `独立正确 ${T.correct} · 提示后正确 ${T.assisted}`;
  }
  $("#vspellSubmit").addEventListener("click", submitSpell);
  $("#vspell").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); submitSpell(); } });

  $("#vhint").addEventListener("click", () => { if (!T.current || T.answered) return; T.hinted = true; $("#vhintText").textContent = T.current.w + " · " + T.current.m; $("#vhintText").hidden = false; });
  $("#vnext").addEventListener("click", next);
  $("#vcardSpeak").addEventListener("click", () => T.current && speak(T.current.w));

  function next() {
    T.awaitNext = false;
    T.i += 1;
    if (T.i >= T.queue.length) finish();
    else renderCard();
  }

  function finish() {
    T.started = false;
    $("#vrun").hidden = true;
    $("#vresult").hidden = false;
    const n = T.queue.length;
    const pct = n ? Math.round(T.correct / n * 100) : 0;
    $("#vresult").innerHTML = `
      <div class="vkicker">RESULT</div>
      <h2>本组完成</h2>
      <div class="vscore">独立正确 ${T.correct} / ${n} · ${pct}% · 提示后正确 ${T.assisted}</div>
      ${T.wrong.length ? `<div class="vwronglist">${T.wrong.map(x => `<div><b>${esc(x.w)}</b><span>${esc(x.m)}</span></div>`).join("")}</div>` : `<p class="vscore">没有错词，继续保持。</p>`}
      <div class="va">
        ${T.wrong.length ? `<button class="vprimary" id="vretryWrong">再测错词</button>` : ""}
        <button class="vghost" id="vbackSetup">返回设置</button>
      </div>`;
    const retry = $("#vretryWrong");
    if (retry) retry.addEventListener("click", () => startTest(T.pool, T.mode, T.wrong.length, T.wrong.map(x => ({ w: x.w, m: x.m }))));
    $("#vbackSetup").addEventListener("click", () => {
      $("#vresult").hidden = true;
      $("#vsetup").hidden = false;
      T.queue = [];
    });
  }

  $("#vquit").addEventListener("click", () => {
    $("#vrun").hidden = true;
    $("#vsetup").hidden = false;
    T.queue = []; T.started = false;
  });

  /* ---------------- shortcut settings ---------------- */
  const keysModal = document.getElementById("keysModal");
  let capturingKey = null;
  const KEY_ROWS = [
    ["known", "认识"], ["fuzzy", "模糊"], ["unknown", "不认识"],
    ["reveal", "显示 / 隐藏释义"], ["speak", "发音"], ["next", "下一题"],
  ];

  function renderKeyRows() {
    if (!keysModal) return;
    const counts = {};
    Object.values(S.keys).forEach(k => { if (k) counts[k] = (counts[k] || 0) + 1; });
    $("#keyRows").innerHTML = KEY_ROWS.map(([action, label]) => {
      const k = S.keys[action];
      const dup = k && counts[k] > 1 ? '<span class="kdup">与其它动作同键</span>' : "";
      return `<div class="krow"><span class="klabel">${label}</span>
        <button class="kstate ${capturingKey === action ? "listening" : ""}" data-key-action="${action}">
          ${capturingKey === action ? "按下新键…" : keyLabel(k)}</button>${dup}</div>`;
    }).join("");
  }
  function openKeys() { capturingKey = null; renderKeyRows(); keysModal.hidden = false; }
  function closeKeys() { capturingKey = null; keysModal.hidden = true; }
  if (keysModal) {
    keysModal.addEventListener("click", e => {
      if (e.target === keysModal) { closeKeys(); return; }
      const b = e.target.closest("[data-key-action]");
      if (b) { capturingKey = b.dataset.keyAction; renderKeyRows(); return; }
      if (e.target.closest("#keysClose")) closeKeys();
      if (e.target.closest("#keysReset")) {
        S.keys = Object.assign({}, DEFAULT_KEYS); save();
        capturingKey = null; renderKeyRows();
        if (T.mode === "card" && T.started) renderGradeBar();
      }
    });
    const setupBtn = document.getElementById("openKeysSetup");
    if (setupBtn) setupBtn.addEventListener("click", openKeys);
    document.addEventListener("keydown", e => {
      if (!capturingKey) return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") { capturingKey = null; renderKeyRows(); return; }
      if (["Shift", "Control", "Alt", "Meta", "CapsLock", "Tab"].includes(e.key)) return;
      const k = e.key === " " ? " " : (e.key.length === 1 ? e.key.toLowerCase() : e.key);
      S.keys[capturingKey] = k;
      capturingKey = null;
      save();
      renderKeyRows();
      if (T.mode === "card" && T.started && $("#vrun") && !$("#vrun").hidden) renderGradeBar();
    }, true);
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && !keysModal.hidden && !capturingKey) closeKeys();
    });
  }

  document.addEventListener("keydown", e => {
    if (!T.started || $("#vrun").hidden) return;
    if (keysModal && !keysModal.hidden) return;
    if (e.target.tagName === "INPUT" && !(T.mode === "spell" && e.key === "Enter")) return;
    if (e.key === "Escape") { $("#vquit").click(); return; }
    if (T.mode === "card") {
      if (T.awaitNext) {
        if (keyMatch(e, "next") || e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
          e.preventDefault(); next();
        }
        return;
      }
      if (keyMatch(e, "known")) { e.preventDefault(); gradeCard("known"); return; }
      if (keyMatch(e, "fuzzy")) { e.preventDefault(); gradeCard("fuzzy"); return; }
      if (keyMatch(e, "unknown")) { e.preventDefault(); gradeCard("unknown"); return; }
      if (keyMatch(e, "reveal")) { e.preventDefault(); reveal(); return; }
      if (keyMatch(e, "speak")) { e.preventDefault(); if (T.current) speak(T.current.w); return; }
      return;
    }
    if (e.key === "Enter") {
      if (T.mode === "spell" && !T.answered) { e.preventDefault(); submitSpell(); }
      else if (T.answered) { e.preventDefault(); next(); }
    }
    if (keyMatch(e, "speak")) { e.preventDefault(); if (T.current) speak(T.current.w); }
  });

  /* ---------------- book ---------------- */
  function bookRows(list, empty, actionLabel, action) {
    if (!list.length) return `<p class="vempty">${empty}</p>`;
    return `<div class="vlist">${list.slice(0, 200).map(w => `
      <div class="vrow" data-w="${esc(w.w)}">
        <button class="vspeak" data-speak="${esc(w.w)}">${SPK}</button>
        <div class="vw"><b>${esc(w.w)}</b></div>
        <div class="vm">${esc(w.m)}</div>
        <div class="vb"></div>
        <div class="va"><button data-book-act="${action}">${actionLabel}</button></div>
      </div>`).join("")}</div>`;
  }

  function renderBook() {
    const starred = WORDS.filter(w => isStar(w.w));
    const wrong = WORDS.filter(w => { const r = recOf(w.w); return !!r && (r.w || 0) > 0; });
    $("#vbook").innerHTML = `
      <div class="vbook">
        <h2>星标生词</h2>
        ${bookRows(starred, "还没有星标词。在词表里点 ☆ 收词。", "移出", "unstar")}
        <h2>错词</h2>
        ${bookRows(wrong, "还没有错词。自测中选“不认识”的词会出现在这里。", "标为认识", "known")}
      </div>`;
  }

  $("#vbook").addEventListener("click", e => {
    const speakBtn = e.target.closest("[data-speak]");
    if (speakBtn) { speak(speakBtn.dataset.speak); return; }
    const poolBtn = e.target.closest("[data-pool]");
    if (poolBtn) {
      startTest(poolBtn.dataset.pool, "card", 20);
      return;
    }
    const act = e.target.closest("[data-book-act]");
    if (act) {
      const row = act.closest(".vrow");
      const w = row.dataset.w;
      if (act.dataset.bookAct === "unstar") { delete S.star[lower(w)]; save(); updateStats(); renderBook(); }
      else if (act.dataset.bookAct === "known") { grade(w, "known"); renderBook(); }
    }
  });
  $$(".vbook-actions [data-pool]").forEach(b => b.addEventListener("click", () => startTest(b.dataset.pool, "card", 20)));

  /* ---------------- tts toggle ---------------- */
  function syncTts() {
    $("#ttsBtn").textContent = S.tts ? "发音 开" : "发音 关";
    $("#ttsBtn").classList.toggle("off", !S.tts);
  }
  $("#ttsBtn").addEventListener("click", () => { S.tts = !S.tts; save(); syncTts(); if (!S.tts && window.speechSynthesis) window.speechSynthesis.cancel(); });

  /* ---------------- init ---------------- */
  function init() {
    if (V.meta && V.meta.total) {
      const b = document.querySelector(".vhero h1 b");
      if (b) b.textContent = V.meta.total;
    }
    const sortEl = $("#vsort"); if (sortEl) sortEl.value = listState.sort;
    renderList();
    renderTopicGrid();
    renderBook();
    syncTts();
    updateStats();
    const h = (location.hash || "#list").slice(1);
    if (["list", "topics", "test", "book"].includes(h)) showTab(h);
    else showTab("list");
  }
  window.addEventListener("hashchange", () => {
    const h = (location.hash || "#list").slice(1);
    if (["list", "topics", "test", "book"].includes(h)) showTab(h);
  });
  init();
})();
