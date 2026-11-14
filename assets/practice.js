(function () {
  "use strict";
  const DATA = window.QUESTIONS;
  if (!DATA) return;
  const ITEMS = (DATA.items || []).map(q => ({...q, _bank:"public"}));
  const PAPERS = window.PAPERS || { real: [], mock: [] };
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const blank = n => `<span class="cloze-blank"><span class="cloze-num">${n}</span></span>`;
  function withBlanks(html) {
    return html.replace(/(^|[\s(（\[>])(\d{1,2})\s*[.．]?(?=$|[\s)）\]<,，;；:：])/g, (m, pre, n) => {
      const v = Number(n);
      if (v < 1 || v > 20) return m;
      return pre + blank(n);
    });
  }
  function passageHTML(text, blanks) {
    const paras = String(text || "").split(/\n\s*\n/);
    return paras.map(p => {
      let h = inline(p.replace(/\n/g, " "));
      if (blanks) h = withBlanks(h);
      return `<p>${h}</p>`;
    }).join("");
  }
  const OBJ_KINDS = ["选择题", "单选题", "多选题", "阅读", "完形", "新题型"];
  function answerLetters(q) {
    if (["pending", "needs_review"].includes(q.reviewStatus)) return "";
    const a = String(q.answer || "");
    return /^[A-H]{1,4}$/.test(a) ? a : "";
  }
  // 单选 / 多选以题型为准，绝不用答案字母个数倒推——答案可能缺字母
  const MULTI_KINDS = ["多选题", "多项选择题"];
  function isMulti(q) {
    if (MULTI_KINDS.includes(q.kind)) return true;
    if (q.kind === "单选题" || q.kind === "单项选择题") return false;
    const a = answerLetters(q);
    return a.length > 1;
  }
  function isObjective(q) { return OBJ_KINDS.includes(q.kind); }
  function questionHTML(q) {
    const stem = [];
    const opts = [];
    for (const ln of String(q.text || "").split("\n")) {
      const m = /^([A-H])[.．、]\s*(.*)$/.exec(ln.trim());
      if (m) opts.push({ l: m[1], t: m[2] });
      else stem.push(ln);
    }
    const parts = stem.filter(l => l.trim()).map(l => `<p>${inline(l)}</p>`).join("");
    const obj = OBJ_KINDS.includes(q.kind);
    const multi = obj && isMulti(q);
    const picked = (session && session.picks && session.picks[q.id]) || [];
    let list = "";
    if (opts.length) {
      list = `<div class="q-opts${obj ? " interactive" : ""}${multi ? " multi" : " single"}">` + opts.map(o => {
        const cls = ["q-opt"];
        if (picked.includes(o.l)) cls.push("picked");
        const tag = obj ? "button" : "div";
        const attr = obj ? ` type="button" data-opt="${o.l}"` : "";
        return `<${tag} class="${cls.join(" ")}"${attr}><span class="ol">${o.l}</span><span class="ot">${inline(o.t)}</span></${tag}>`;
      }).join("") + `</div>`;
    }
    return parts + list;
  }
  const KEY = "atlas.practice.v1";
  const AI_ENDPOINT = (window.ATLAS_CONFIG && window.ATLAS_CONFIG.gradeEndpoint) || "";

  const state = { mode: "knowledge", subject: "all", chapter: "all", kp: "", bank: "all", paper: "all", diff: "all", source: "all", count: 10 };
  let session = null;
  let timerId = null;
  let confirmCb = null;
  let diagnosticPreview = [];

  let store = {rec:{}};
  function save() { window.AtlasUser.save("practice", store).catch(err => console.error(err)); }
  const recOf = id => store.rec[id] || null;

  function renderMath(el) {
    if (!window.renderMathInElement) return;
    try {
      window.renderMathInElement(el, {
        delimiters: [{ left: "\\(", right: "\\)", display: false }, { left: "\\[", right: "\\]", display: true }],
        throwOnError: false,
      });
    } catch (e) { /* ignore */ }
  }

  const SUBJECT_NAMES = { math: "数学一", math2: "数学二", english: "英语一", english2: "英语二", mechanics: "807 材料力学", politics: "政治" };
  const SUBJECTS = Object.keys(SUBJECT_NAMES).map(id => ({
    id, name: SUBJECT_NAMES[id], count: ITEMS.filter(i => i.subject === id).length,
  }));

  function populateSubjects() {
    $("#fSubject").innerHTML = `<option value="all">全部科目（${ITEMS.length}）</option>` +
      SUBJECTS.map(s => `<option value="${s.id}">${esc(s.name)}（${ITEMS.filter(i => i.subject === s.id).length}）</option>`).join("");
  }

  function isPaperChapter(id) {
    const list = ITEMS.filter(i => i.chapter === id);
    return list.length > 0 && list.every(i => !i.kp && /第\d+题/.test(i.kpName || ""));
  }
  const topicOf = i => i.topicChapter || i.chapter;
  const TOPIC_NAMES = {
    "pol-01": "马克思主义基本原理（哲学）",
    "pol-02": "马克思主义政治经济学与科学社会主义",
    "pol-03": "毛泽东思想和中国特色社会主义理论体系",
    "pol-04": "习近平新时代中国特色社会主义思想",
    "pol-05": "中国近现代史纲要",
    "pol-06": "思想道德与法治",
    "pol-07": "形势与政策及当代世界经济与政治",
    "english-01": "词汇与长难句",
    "english-02": "完形填空",
    "english-03": "阅读理解 Part A",
    "english-04": "新题型 Part B",
    "english-05": "翻译 Part C",
    "english-06": "小作文",
    "english-07": "大作文",
    "english-08": "作文句式分类库",
  };

  const topicNameOf = i => TOPIC_NAMES[i.topicChapter] || i.topicTitle || i.chapterTitle;
  const inTopicMode = i => !isPaperChapter(i.chapter) || !!i.topicChapter;

  function renderChapterOptions() {
    const pool = ITEMS.filter(i =>
      (state.subject === "all" || i.subject === state.subject) && inTopicMode(i));
    const map = new Map();
    pool.forEach(i => map.set(topicOf(i), topicNameOf(i)));
    state.chapter = "all";
    $("#fChapter").innerHTML = `<option value="all">全部知识点章节</option>` +
      [...map].map(([id, title]) => `<option value="${esc(id)}">${esc(title)}</option>`).join("");
    renderPaperOptions();
  }

  function paperList() {
    const map = new Map();
    ITEMS.forEach(i => {
      if ((state.bank !== "all" && i._bank !== state.bank) || !isPaperChapter(i.chapter)) return;
      if (!map.has(i.chapter)) {
        map.set(i.chapter, {
          id: i.chapter, title: i.chapterTitle, count: 0,
          real: false, mock: false, year: 0,
        });
      }
      const p = map.get(i.chapter);
      p.count += 1;
      if (i.isMock) p.mock = true;
      if (i.isReal) p.real = true;
      if (i.year) p.year = Math.max(p.year, Number(i.year) || 0);
      if (!p.subject) p.subject = i.subject;
      if (!p.subjectName) p.subjectName = i.subjectName || i.subject;
    });
    return [...map.values()];
  }

  function archiveOf(key) {
    const m = /^pdf:(real|mock):(\d+)$/.exec(key || "");
    return m ? (PAPERS[m[1]] || [])[Number(m[2])] : null;
  }

  function renderPaperOptions() {
    const list = paperList().filter(p => state.subject === "all" || p.subject === state.subject);
    const real = [];
    const transcribed = new Set();
    list.filter(p => !p.mock).forEach(p => {
      if (p.year) transcribed.add(`${p.subject}:${p.year}`);
      real.push({ value: p.id, year: p.year || 0,
        label: `${p.title} · ${p.count} 题 · 可刷题` });
    });
    PAPERS.real.forEach((p, i) => {
      const sid = p.subjectId || "math";
      if (state.subject !== "all" && state.subject !== sid) return;
      if (transcribed.has(`${sid}:${p.year}`)) return;
      real.push({ value: `pdf:real:${i}`, year: p.year || 0,
        label: `${p.title} · 原卷 ${p.pages} 页` });
    });
    real.sort((a, b) => b.year - a.year || a.label.localeCompare(b.label));

    const mock = list.filter(p => p.mock)
      .map(p => ({ value: p.id, label: `${p.title} · ${p.count} 题 · 可刷题` }));
    if (state.subject === "all" || state.subject === "math") {
      const mockTitles = list.filter(p => p.mock).map(p => p.title);
      PAPERS.mock.forEach((p, i) => {
        const base = p.title.replace(/（数一）$/, "");
        if (mockTitles.some(t => t.startsWith(base))) return;
        mock.push({ value: `pdf:mock:${i}`, label: `${p.title} · 原卷 ${p.pages} 页` });
      });
    }
    mock.sort((a, b) => a.label.localeCompare(b.label));

    state.paper = "all";
    let html = `<option value="all">请选择一套卷</option>`;
    if (real.length) {
      html += `<optgroup label="真题（按年份）">` +
        real.map(p => `<option value="${esc(p.value)}">${esc(p.label)}</option>`).join("") +
        `</optgroup>`;
    }
    if (mock.length) {
      html += `<optgroup label="模拟卷">` +
        mock.map(p => `<option value="${esc(p.value)}">${esc(p.label)}</option>`).join("") +
        `</optgroup>`;
    }
    $("#fPaper").innerHTML = html;
  }

  function currentPool() {
    if (state.mode === "paper") {
      if (state.paper === "all") return [];
      return ITEMS.filter(i => (state.bank === "all" || i._bank === state.bank) && i.chapter === state.paper &&
        (state.subject === "all" || i.subject === state.subject));
    }
    return ITEMS.filter(i => {
      if (state.bank !== "all" && i._bank !== state.bank) return false;
      if (state.mode === "knowledge" && !inTopicMode(i)) return false;
      if (state.mode === "diagnostic" && state.subject === "all") return false;
      if (state.mode === "knowledge" && state.kp && i.kp !== state.kp) return false;
      if (state.subject !== "all" && i.subject !== state.subject) return false;
      if (state.mode === "knowledge" && state.chapter !== "all" && topicOf(i) !== state.chapter) return false;
      if (state.diff !== "all" && (i.difficulty || "中") !== state.diff) return false;
      if (state.source === "real" && !i.isReal) return false;
      if (state.source === "same" && i.isReal) return false;
      if (state.source === "mock" && !i.isMock) return false;
      return true;
    });
  }

  function updateCount() {
    const info = $("#structureInfo"); info.hidden = true; info.textContent = "";
    if ((state.mode === "paper" || state.mode === "diagnostic") && state.subject === "all") {
      $("#pcount").textContent = "请先选择单一科目"; $("#pstart").disabled = true; $("#paperSol").hidden = true; return 0;
    }
    const arc = state.mode === "paper" ? archiveOf(state.paper) : null;
    if (arc) {
      $("#pcount").textContent = `完整原卷 · ${arc.pages} 页${arc.solution ? " · 附解析" : ""}`;
      $("#pstart").disabled = false;
      $("#paperSol").hidden = true;
      if (arc.solution) $("#paperSol").href = encodeURI(arc.solution);
      return arc.pages;
    }
    $("#paperSol").hidden = true;
    const n = currentPool().length;
    if (state.mode === "paper" && state.paper === "all") {
      $("#pcount").textContent = "套卷模式：请先在「套卷」里选一份完整试卷";
      $("#pstart").disabled = true;
      return 0;
    }
    const pool = currentPool();
    if (state.mode === "diagnostic") {
      const groups = diagnosticGroups(state.subject), selected = diagnosticPool(pool, state.subject);
      diagnosticPreview = selected;
      const counts = groups && groups.map(g => { const available = selected.filter(q => g.kinds.includes(q.kind)).length; return `${g.name} ${available}/${g.count}${available < g.count ? "（缺题）" : ""}`; });
      const missing = selected.filter(q => !Number.isFinite(Number(q.maxScore)) || q.maxScore == null || Number(q.maxScore) <= 0).length;
      const knownMax = selected.filter(q => q.maxScore != null && Number.isFinite(Number(q.maxScore)) && Number(q.maxScore) > 0).reduce((sum,q) => sum + Number(q.maxScore), 0);
      const missingNo = selected.filter(q => paperNo(q) === 9999).length;
      info.textContent = (counts ? `按试卷题型配额：${counts.join("；")}。${["english", "english2"].includes(state.subject) ? "完形、阅读、新题型按原文及完整题组抽取，英语一翻译按原卷题组抽取；原文或题目不全的不计入。" : ""}` : `材料力学未设统一题型配额，按可用原卷题号排序，${missingNo} 题题号待核并排在末尾，题量由下方选择。`) + `实际抽取 ${selected.length} 题，已知满分合计 ${knownMax} 分，其中 ${missing} 题满分待核；${counts ? "未列入的题型不计入自测。" : ""}`;
      info.hidden = false; $("#pcount").textContent = `当前可组卷：${selected.length} 题`;
      $("#pstart").disabled = !selected.length; return selected.length;
    }
    if (state.mode === "paper") { const missing = pool.filter(q => q.maxScore == null || !Number.isFinite(Number(q.maxScore)) || Number(q.maxScore) <= 0).length; const counts = {}; pool.forEach(q => { const kind = q.kind || "未分类"; counts[kind] = (counts[kind] || 0) + 1; }); const known = pool.filter(q => q.maxScore != null && Number.isFinite(Number(q.maxScore)) && Number(q.maxScore) > 0).reduce((sum,q) => sum + Number(q.maxScore),0); const no = pool.filter(q => paperNo(q) === 9999).length; info.textContent = `原卷录入 ${n} 题：${Object.entries(counts).map(([k,v]) => `${k} ${v} 题`).join("；")}。已知满分合计 ${known} 分，${missing} 题满分待核；${no} 题题号待核并排在末尾。`; info.hidden = false; }
    $("#pcount").textContent = state.mode === "paper" ? `本套卷：${n} 题` : `当前可组卷：${n} 题`;
    $("#pstart").disabled = n === 0;
    return n;
  }

  function setMode(mode) {
    state.mode = mode;
    $$("#modeTabs button").forEach(b => b.classList.toggle("on", b.dataset.mode === mode));
    const paper = mode === "paper";
    $("#rowChapter").hidden = paper || mode === "diagnostic";
    $("#rowPaper").hidden = !paper;
    $("#rowDiff").hidden = paper;
    $("#rowSource").hidden = paper;
    $("#countRow").hidden = paper || (mode === "diagnostic" && state.subject !== "mechanics");
    $("#paperNote").hidden = !paper;
    updateCount();
  }

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function paperNo(q) {
    const m = /第\s*(\d+)\s*题/.exec(q.kpName || "");
    const value = q.questionNo || q.paperNo || (m && m[1]);
    return Number(value) || 9999;
  }

  function stratified(pool, count) {
    const groups = new Map();
    shuffle(pool.slice()).forEach(q => { const key = `${topicOf(q) || "未分类"}|${q.year || (q.isReal || q.isMock ? q.chapter : "知识点")}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(q); });
    const buckets = shuffle([...groups.values()]), out = [];
    while (buckets.length && (!count || out.length < count)) for (let i = buckets.length - 1; i >= 0 && (!count || out.length < count); i--) { out.push(buckets[i].pop()); if (!buckets[i].length) buckets.splice(i, 1); }
    return out;
  }
  function diagnosticGroups(subject) {
    if (["math", "math2"].includes(subject)) return [
      {name:"选择题", kinds:["选择题", "单选题"], count:10},
      {name:"填空题", kinds:["填空题"], count:6},
      {name:"解答题", kinds:["计算题", "证明题", "解答题"], count:6}
    ];
    if (["english", "english2"].includes(subject)) return [
      {name:"完形", kinds:["完形"], count:20}, {name:"阅读", kinds:["阅读"], count:20},
      {name:"新题型", kinds:["新题型"], count:5}, {name:"翻译", kinds:["翻译"], count:subject === "english" ? 5 : 1},
      {name:"小作文", kinds:["小作文"], count:1}, {name:"大作文", kinds:["大作文"], count:1}
    ];
    if (subject === "politics") return [
      {name:"单选", kinds:["单选题", "单项选择题"], count:16},
      {name:"多选", kinds:["多选题", "多项选择题"], count:17},
      {name:"分析", kinds:["分析题"], count:5}
    ];
    return null;
  }
  function diagnosticPool(pool, subject) {
    const single = pool.filter(q => q.subject === subject), groups = diagnosticGroups(subject);
    if (groups) return groups.flatMap(g => {
      const candidates = single.filter(q => g.kinds.includes(q.kind));
      if (!["english", "english2"].includes(subject) || !["完形", "阅读", "新题型", "翻译"].includes(g.name) || (g.name === "翻译" && subject === "english2")) return stratified(candidates, g.count);
      const size = g.name === "完形" ? 20 : 5, sets = new Map();
      candidates.forEach(q => {
        const no = paperNo(q), start = g.name === "阅读" ? 21 + 5 * Math.floor((no - 21) / 5) : {"完形":1, "新题型":41, "翻译":46}[g.name];
        if (no < start || no >= start + size || (g.name === "阅读" && (start < 21 || start > 36)) || !q.chapter || (g.name !== "翻译" && !q.passage)) return;
        const key = `${q.chapter}|${start}|${g.name === "翻译" ? "" : q.passage}`;
        if (!sets.has(key)) sets.set(key, []);
        sets.get(key).push(q);
      });
      const complete = [...sets.values()].filter(set => set.length === size && new Set(set.map(paperNo)).size === size);
      return shuffle(complete).slice(0, g.count / size).flatMap(set => set.sort((a,b) => paperNo(a) - paperNo(b)));
    });
    return stratified(single, state.count || 500).sort((a,b) => paperNo(a) - paperNo(b));
  }
  const sealed = () => session && session.mode !== "knowledge" && !session.ended;
  function start(poolOverride) {
    if ((state.mode === "paper" || state.mode === "diagnostic") && state.subject === "all") return;
    if (state.mode === "paper") {
      const arc = archiveOf(state.paper);
      if (arc) {
        if (arc.exam) window.open(encodeURI(arc.exam), "_blank");
        return;
      }
    }
    let pool = poolOverride || currentPool();
    if (!pool.length) { $("#pcount").textContent = "没有符合条件的题目"; return; }
    if (!poolOverride && state.mode === "knowledge") pool = shuffle(pool.slice());
    if (!poolOverride && state.mode === "knowledge" && state.count > 0) pool = pool.slice(0, state.count);
    if (!poolOverride && state.mode === "diagnostic") pool = diagnosticPreview.slice();
    if (!pool.length || (state.mode !== "knowledge" && pool.some(q => q.subject !== state.subject))) { $("#pcount").textContent = "题型不足或科目不一致，无法组卷"; return; }
    if (!poolOverride && state.mode === "paper") pool = pool.slice().sort((a, b) => paperNo(a) - paperNo(b));
    $("#sideSubmit").hidden = false;
    session = { queue: pool, i: 0, status: {}, notes: {}, picks: {}, locked: {}, startTime: Date.now(), ended: false, mode: state.mode, structure: $("#structureInfo").hidden ? "" : $("#structureInfo").textContent };
    const sub = SUBJECTS.find(s => s.id === state.subject);
    const title = poolOverride ? "错题重练" : (state.mode === "diagnostic" ? `${sub ? sub.name : state.subject} · 能力自测` : state.mode === "paper" ? pool[0].chapterTitle
      : (state.chapter !== "all" ? pool[0].chapterTitle
        : (sub ? sub.name : "全科综合")));
    $("#paperTitle").textContent = `${title} · ${pool.length} 题`;
    $("#setup").hidden = true;
    $("#result").hidden = true;
    $("#exam").hidden = false;
    $("#submitBtn").hidden = false;
    $("#exitBtn").hidden = false;
    $("#bankLink").hidden = true;
    $("#examGrid").classList.toggle("paper-mode", state.mode === "paper");
    document.body.classList.toggle("paper-run", state.mode === "paper");
    // 套卷模式也给题号目录：默认收起，点「目录」展开
    $("#tocBtn").hidden = false;
    $("#sheet").hidden = state.mode === "paper";
    $("#examGrid").classList.toggle("sheet-hidden", state.mode === "paper");
    $("#tocBtn").textContent = "目录";
    $("#timer").textContent = "00:00";
    if (timerId) clearInterval(timerId);
    timerId = setInterval(tick, 1000);
    window.scrollTo({ top: 0 });
    renderSheet();
    renderQuestion();
  }

  function tick() {
    if (!session || session.ended) return;
    const sec = Math.floor((Date.now() - session.startTime) / 1000);
    $("#timer").textContent = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  }

  function renderSheet() {
    const qs = session.queue;
    $("#sheetMeta").textContent = `${qs.length} 题`;
    const ended = !!(session && session.ended);
    $("#qgrid").innerHTML = qs.map((q, i) => {
      const st = session.status[q.id] || "";
      const answered = (session.picks[q.id] || []).length > 0 || !!st;
      // 交卷前只显示「未答 / 已答」，不泄露对错；交卷后显示 ok/wrong
      const cls = ended ? st : (answered ? "answered" : "");
      return `<button class="qbtn ${cls} ${i === session.i ? "cur" : ""}" data-i="${i}">${i + 1}</button>`;
    }).join("");
    const ok = qs.filter(q => session.status[q.id] === "ok").length;
    const wrong = qs.filter(q => session.status[q.id] === "wrong").length;
    const fuzzy = qs.filter(q => session.status[q.id] === "fuzzy").length;
    if (ended) {
      $("#sheetStats").innerHTML = `已做 ${ok + wrong + fuzzy} / ${qs.length}<br>对 ${ok} · 错 ${wrong}${fuzzy ? ` · 模糊 ${fuzzy}` : ""}`;
    } else {
      const answered = qs.filter(q => (session.picks[q.id] || []).length || session.status[q.id]).length;
      $("#sheetStats").innerHTML = `已答 ${answered} / ${qs.length}<br>交卷后统一判分`;
    }
  }

  function current() { return session.queue[session.i]; }

  function renderQuestion() {
    const q = current();
    if (!q) return;
    const st = session.status[q.id];
    $("#qno").textContent = `第 ${session.i + 1} 题 / 共 ${session.queue.length} 题`;
    $("#qtype").textContent = `${q.kind} · ${q.difficulty || "中"}`;
    $("#qsrc").textContent = q.isReal ? `真题 ${q.year}` : "同型题";
    $("#qkp").textContent = `${q.subjectName} · ${q.topicTitle || q.chapterTitle} · ${q.kpName}`;
    $("#qfigs").innerHTML = (q.figures || []).map(f => {
      const src = typeof f === "string" ? f : (f && f.src) || "";
      if (!src) return "";
      const url = src.includes(".") ? `assets/figs/${src}` : `assets/figs/${src}.svg`;
      return `<img src="${url}" alt="题图" onerror="this.remove()">`;
    }).join("");
    $("#qtext").innerHTML = questionHTML(q);
    renderMath($("#qtext"));
    const hasPassage = !!(q.passage && q.passage.trim());
    $("#qpassage").hidden = !hasPassage;
    $("#paperCard").classList.toggle("has-passage", hasPassage);
    if (hasPassage) {
      const isCloze = q.kind === "完形";
      $("#qpassagebody").innerHTML = passageHTML(q.passage, isCloze);
      renderMath($("#qpassagebody"));
      $("#qpassage").open = true;
    }
    $("#work").value = session.notes[q.id] || "";
    const subjective = isSubjective(q);
    $("#photoBox").hidden = !subjective;
    const aiAsk = $("#aiAsk");
    if (aiAsk) {
      aiAsk.hidden = !AI_ENDPOINT;
      aiAsk.textContent = (q.kind === "大作文" || q.kind === "小作文") ? "AI 批改作文"
        : (q.kind === "翻译" ? "AI 核对翻译" : "AI 核对答案");
    }
    showPhoto(null);
    if (subjective) {
      photoGet(q.id).then(url => {
        if (url && session && current() && current().id === q.id) showPhoto(url);
      });
    }
    $("#solution").hidden = true;
    $("#solution").innerHTML = "";
    $("#aiResult").hidden = true;
    $("#aiResult").innerHTML = "";
    $("#gradebar").hidden = true;
    $$("#gradebar button").forEach(b => { b.disabled = false; b.classList.remove("on"); });
    if (st && !sealed()) showSolution(true);
    $("#reveal").hidden = !!sealed();
    $("#aiAsk").hidden = !!sealed() || !AI_ENDPOINT;
    $("#work").readOnly = session.ended;
    $("#photoTake").hidden = session.ended;
    $("#photoPick").hidden = session.ended;
    $("#photoRemove").hidden = session.ended;
    if (session.ended && OBJ_KINDS.includes(q.kind)) paintObjective(q);
    if (session.ended) {
      showSolution(true);
      const result = session.attempt && session.attempt.results && session.attempt.results[q.id];
      if (result) { $("#aiResult").hidden = false; $("#aiResult").textContent = [result.comments, result.missing, result.suggestions, result.revised].filter(Boolean).join("\n\n"); }
      $("#reveal").textContent = "返回结果";
      if (["english", "english2"].includes(q.subject) && /翻译|作文/.test(q.kind)) { $("#aiAsk").hidden = false; $("#aiAsk").textContent = "AI 多轮指导"; }
    } else $("#reveal").textContent = "显示解析（Space）";
    const readCh = q.topicChapter || (q.kp ? q.chapter : "");
    $("#pklink").hidden = !readCh;
    $("#pklink").href = `index.html#read=${encodeURIComponent(readCh)}` +
      (q.kp ? `&kp=${encodeURIComponent(q.kp)}` : "");
    $("#pbig").hidden = !q.pageImage;
    if (q.sourcePdf) {
      $("#psource").href = encodeURI(q.sourcePdf) + "#page=" + (q.sourcePage || 1);
      $("#psource").hidden = false;
    } else {
      $("#psource").hidden = true;
    }
    if (q.solutionPdf && !sealed()) {
      $("#psol").href = encodeURI(q.solutionPdf) + "#page=" + (q.solutionPage || 1);
      $("#psol").hidden = false;
    } else {
      $("#psol").hidden = true;
    }
    $("#prev").disabled = session.i === 0;
    $("#next").disabled = session.i === session.queue.length - 1;
    renderSheet();
  }

  function showSolution(alreadyGraded) {
    const q = current(); if (!q || sealed()) return;
    const obj = OBJ_KINDS.includes(q.kind);
    const unverified = ["pending", "needs_review"].includes(q.reviewStatus);
    // 客观题在交卷前不给答案，避免边做边对——交卷后统一揭示
    const answerSealed = obj && !session.ended;
    const ans = (!answerSealed && q.answer)
      ? `<div class="slabel2">${unverified ? "待核参考" : "要点"}</div><div class="sans">${fmt(q.answer)}</div>` : "";
    const steps = (!answerSealed && (q.steps || []).length)
      ? `<div class="slabel2" style="margin-top:10px">完整解答</div><ol class="ssteps">${q.steps.map(s => `<li>${fmt(s)}</li>`).join("")}</ol>` : "";
    const hint = answerSealed
      ? `<div class="sans" style="color:var(--ink3)">客观题答案将在交卷后统一公布。先选好你的答案。</div>`
      : (!q.answer ? `<div class="sans" style="color:var(--ink3)">这题暂无已核对答案，可自评。</div>` : "");
    const warning = !answerSealed && unverified ? `<div class="sans">答案与解析待核，不能作为确定的评分依据。${q.reviewReason ? ` ${esc(q.reviewReason)}` : ""}</div>` : "";
    $("#solution").innerHTML = warning + ans + steps + hint;
    renderMath($("#solution"));
    $("#solution").hidden = false;
    $("#gradebar").hidden = answerSealed || obj;
    if (alreadyGraded) {
      $$("#gradebar button").forEach(b => { b.disabled = true; });
      const st = session.status[q.id];
      const btn = $(`#gradebar button[data-grade="${st}"]`);
      if (btn) btn.classList.add("on");
    }
  }

  // 交卷后把选项染成 对/错：正确项绿、错选红
  function paintObjective(q) {
    const ans = answerLetters(q);
    if (!ans) return;
    const picked = session.picks[q.id] || [];
    $$("#qtext .q-opt").forEach(el => {
      const l = el.dataset.opt;
      el.classList.remove("correct", "wrong");
      if (ans.includes(l)) el.classList.add("correct");
      else if (picked.includes(l)) el.classList.add("wrong");
    });
  }

  function grade(kind) {
    const q = current();
    if (!q || sealed() || session.ended || session.status[q.id]) return;
    session.status[q.id] = kind;
    const r = store.rec[q.id] || { seen: 0, ok: 0, wrong: 0, last: 0 };
    r.seen += 1; r.last = Date.now();
    if (kind === "ok") r.ok += 1; else if (kind === "wrong") r.wrong += 1;
    store.rec[q.id] = r; save();
    if ($("#solution").hidden) showSolution(false);
    $$("#gradebar button").forEach(b => { b.disabled = true; });
    const btn = $(`#gradebar button[data-grade="${kind}"]`);
    if (btn) btn.classList.add("on");
    renderSheet();
  }

  function go(i) {
    if (i < 0 || i >= session.queue.length) return;
    session.i = i;
    renderQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- confirm modal ---------- */
  function askConfirm(title, text, cb) {
    $("#confirmTitle").textContent = title;
    $("#confirmText").textContent = text;
    confirmCb = cb;
    $("#confirmModal").hidden = false;
  }
  function closeConfirm() { $("#confirmModal").hidden = true; confirmCb = null; }
  $("#confirmCancel").addEventListener("click", closeConfirm);
  $("#confirmModal").addEventListener("click", e => { if (e.target === $("#confirmModal")) closeConfirm(); });
  $("#confirmOk").addEventListener("click", () => {
    const cb = confirmCb; closeConfirm(); if (cb) cb();
  });

  function requestSubmit() {
    if (!session || session.ended) return;
    const left = session.queue.filter(q => !(session.picks[q.id] || []).length && !session.notes[q.id]).length;
    askConfirm("交卷", left > 0
      ? `还有 ${left} 题未作答。检查完毕，确认交卷吗？`
      : "已检查完毕，确认交卷吗？", doSubmit);
  }

  async function doSubmit() {
    if (session.submitting) return;
    session.submitting = true;
    if (session.mode === "knowledge") {
      session.queue.forEach(q => { const ans = answerLetters(q), picks = session.picks[q.id] || []; if (!session.status[q.id] && ans && picks.length) { const kind = picks.slice().sort().join("") === ans.split("").sort().join("") ? "ok" : "wrong"; session.status[q.id] = kind; const r = store.rec[q.id] || {seen:0, ok:0, wrong:0, last:0}; r.seen++; r[kind]++; r.last = Date.now(); store.rec[q.id] = r; } }); save();
      finishSubmit(); return;
    }
    const answers = {};
    for (const q of session.queue) answers[q.id] = {work:session.notes[q.id] || "", selected:session.picks[q.id] || [], image:await photoGet(q.id) || ""};
    const id = crypto.randomUUID();
    try {
      const data = await window.AtlasUser.json("/api/attempts", "POST", {id, subject:session.queue[0].subject, mode:session.mode, questions:session.queue, answers});
      session.attempt = data.attempt;
      session.gradeQueue = session.queue.map(q => q.id);
      session.gradeTotal = session.gradeQueue.length;
      session.gradeDone = 0;
      finishSubmit();
      await runGradeQueue(id);
    } catch (err) { session.submitting = false; askConfirm("保存失败", `交卷未完成：${err.message}。请重试。`, () => {}); }
  }
  async function runGradeQueue(attemptId) {
    const queue = (session && session.gradeQueue || []).slice();
    let cursor = 0;
    const worker = async () => {
      while (session && session.attempt && session.attempt.id === attemptId) {
        const id = queue[cursor++];
        if (!id) return;
        await gradeAttempt(id);
        if (session && session.attempt && session.attempt.id === attemptId) {
          session.gradeDone = Math.min((session.gradeDone || 0) + 1, session.gradeTotal || queue.length);
          updateResultStatus();
        }
      }
    };
    await Promise.all([worker(), worker()]);
    if (session && session.attempt && session.attempt.id === attemptId) {
      session.gradeQueue = [];
      session.gradeDone = session.gradeTotal;
      updateResultStatus();
      const host = document.getElementById("mastery");
      if (host) window.AtlasAssessment.renderMastery(host, session.queue, session.attempt.results || {});
    }
  }
  async function gradeAttempt(id) {
    if (!session || !session.attempt) return;
    const active = session; session.grading = id; updateResultStatus();
    try {
      const data = await window.AtlasUser.json(`/api/attempts/${encodeURIComponent(session.attempt.id)}/grade`, "POST", {questionId:id});
      if (session !== active) return;
      const prev = session.attempt && session.attempt.results || {};
      session.attempt = Object.assign({}, data.attempt, {results:Object.assign({}, prev, data.attempt && data.attempt.results || {})});
      session.errors = session.errors || {}; delete session.errors[id];
    }
    catch (err) { if (session === active) { session.errors = session.errors || {}; session.errors[id] = err.message; } }
    finally { if (session === active) { session.grading = null; updateResultStatus(); } }
  }
  function finishSubmit() {
    session.ended = true; if (timerId) clearInterval(timerId);
    $("#submitBtn").hidden = true; $("#exitBtn").hidden = true; $("#tocBtn").hidden = true; $("#exam").hidden = true; $("#result").hidden = false; $("#bankLink").hidden = false; document.body.classList.remove("paper-run"); renderResult();
  }
  function qStatus(q) {
    const results = session.attempt && session.attempt.results || {};
    const r = results[q.id];
    if (isObjective(q) && answerLetters(q) && (session.picks[q.id] || []).length) return (session.picks[q.id] || []).slice().sort().join("") === answerLetters(q).split("").sort().join("") ? "ok" : "wrong";
    if (!r || r.status !== "graded") return session.status[q.id] || "pending";
    return r.maxScore != null && Number(r.maxScore) > 0 && Number(r.score) >= Number(r.maxScore) ? "ok" : "fuzzy";
  }
  function resultTotals() {
    const results = session.attempt && session.attempt.results || {};
    let score = 0, max = 0, completed = 0, missingMax = 0;
    session.queue.forEach(q => {
      const r = results[q.id];
      if (!r || r.status !== "graded") { if (q.maxScore == null) missingMax++; return; }
      completed++;
      if (r.maxScore != null && Number.isFinite(Number(r.maxScore))) { max += Number(r.maxScore); score += Number(r.score) || 0; }
      else missingMax++;
    });
    return {score, max, completed, missingMax};
  }
  function updateResultStatus() {
    if (!session || $("#result").hidden) return;
    const {score, max, completed, missingMax} = resultTotals();
    const total = session.gradeTotal || 0, done = Math.min(session.gradeDone || 0, total);
    const running = (session.gradeQueue && session.gradeQueue.length) || session.grading;
    const sum = $("#rsummary");
    const results = session.attempt && session.attempt.results || {};
    const assumedCount = session.queue.filter(q => { const r = results[q.id]; return r && r.maxScoreAssumed; }).length;
    if (sum) sum.textContent = `已评分 ${completed} / ${session.queue.length} 题 · 已核分值范围 ${score} / ${max} 分 · ${missingMax} 题满分待核${assumedCount ? ` · ${assumedCount} 题按试卷结构估算满分` : ""}`;
    const box = $("#rprogress");
    if (box) {
      box.hidden = !total;
      box.classList.toggle("done", Boolean(total) && !running);
      const txt = $("#rprogressText");
      if (txt) txt.textContent = running ? `AI 正在评分 ${done} / ${total}` : `评卷完成 ${done} / ${total}`;
      const bar = $("#rprogressBar");
      if (bar) bar.style.width = total ? Math.round(done / total * 100) + "%" : "0%";
    }
    session.queue.forEach((q, i) => {
      const b = $(`#result [data-review="${i}"]`);
      if (b) b.className = qStatus(q);
    });
    const errBox = $("#rerrors");
    if (errBox) errBox.innerHTML = Object.entries(session.errors || {}).map(([id, error]) => `<p class="rerr">评分失败：${esc(error)} <button type="button" data-retry="${esc(id)}">重试该题</button></p>`).join("");
    errBox && errBox.querySelectorAll("[data-retry]").forEach(b => b.onclick = () => gradeAttempt(b.dataset.retry));
    const back = $("#backSetup");
    if (back) back.disabled = Boolean(running);
  }
  function renderResult() {
    if (!session || $("#result").hidden) return;
    const masteryWasOpen = !!$("#masteryDialog[open]");
    const results = session.attempt && session.attempt.results || {};
    const structureBrief = session.structure ? session.structure.split("。")[0] + "。" : "";
    $("#result").innerHTML = `<div class="ekicker">RESULT</div><h2>交卷完成</h2><p class="rsum">${esc(structureBrief)}</p><div class="rprogress" id="rprogress" hidden><span class="spinner"></span><span class="rcheck" aria-hidden="true">✓</span><span id="rprogressText"></span><div class="rbar"><i id="rprogressBar"></i></div></div><div class="rsum" id="rsummary"></div><div class="rgrid">${session.queue.map((q,i) => `<button class="${qStatus(q)}" data-review="${i}" aria-label="回顾第 ${i+1} 题，${qStatus(q)}">${i+1}</button>`).join("")}</div><p class="rsum">点击任意题号回顾解析和反馈。绿色：正确；红色：错误；其他：待核或部分得分。</p><div id="rerrors"></div><div id="mastery"></div><div class="racts"><button id="backSetup">再组一卷</button></div>`;
    window.AtlasAssessment.renderMastery(document.getElementById("mastery"), session.queue, results);
    if (masteryWasOpen) $("#masteryDialog").showModal();
    $("#result").querySelectorAll("[data-review]").forEach(b => b.onclick = () => { $("#result").hidden = true; $("#exam").hidden = false; $("#sheet").hidden = false; $("#sideSubmit").hidden = true; session.i = Number(b.dataset.review); renderQuestion(); });
    $("#backSetup").onclick = () => { $("#result").hidden = true; $("#setup").hidden = false; session = null; updateCount(); };
    updateResultStatus();
  }

  function requestExit() {
    askConfirm("退出考试", "已作答内容会保存在本机，确定退出吗？", () => {
      if (timerId) clearInterval(timerId);
      session = null;
      $("#submitBtn").hidden = true;
      $("#exitBtn").hidden = true;
      $("#tocBtn").hidden = true;
      $("#exam").hidden = true;
      $("#setup").hidden = false;
      $("#bankLink").hidden = false;
      document.body.classList.remove("paper-run");
      updateCount();
    });
  }

  /* ---------- answer photo + AI grading ---------- */
  let DB_NAME;
  const DB_STORE = "photos";
  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error("no indexedDB")); return; }
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains(DB_STORE)) d.createObjectStore(DB_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  async function photoGet(id) {
    try {
      const d = await db();
      return await new Promise((resolve, reject) => {
        const tx = d.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(id);
        tx.onsuccess = () => resolve(tx.result || null);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) { return null; }
  }
  async function photoPut(id, url) {
    try {
      const d = await db();
      await new Promise((resolve, reject) => {
        const tx = d.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put(url, id);
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
    } catch (e) { /* preview only */ }
  }
  async function photoDel(id) {
    try {
      const d = await db();
      await new Promise((resolve, reject) => {
        const tx = d.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).delete(id);
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
    } catch (e) { /* ignore */ }
  }
  function isSubjective(q) {
    if (!q) return false;
    if (["math", "math2"].includes(q.subject)) return ["计算题", "证明题"].includes(q.kind);
    if (q.subject === "mechanics") return ["计算题", "简答题"].includes(q.kind);
    if (["english", "english2"].includes(q.subject)) return ["翻译", "小作文", "大作文", "句式"].includes(q.kind);
    if (q.subject === "politics") return ["分析题"].includes(q.kind);
    return false;
  }
  function fileToDataUrl(file) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = 1400;
        let w = img.width, h = img.height;
        if (w > max || h > max) { const s = Math.min(max / w, max / h); w = Math.round(w * s); h = Math.round(h * s); }
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }
  function updateAIButton() {
    const q = current();
    const hasPhoto = !$("#photoPreview").hidden;
    $("#aiGrade").hidden = !!sealed() || !(q && isSubjective(q) && hasPhoto && AI_ENDPOINT);
  }
  function showPhoto(url) {
    const box = $("#photoPreview");
    if (!url) { box.hidden = true; $("#photoImg").removeAttribute("src"); }
    else { $("#photoImg").src = url; box.hidden = false; }
    updateAIButton();
  }
  async function aiGrade(photoOnly) {
    const q = current(); if (!q || sealed() || !AI_ENDPOINT) return;
    const work = ($("#work").value || "").trim();
    const picks = (session && session.picks && session.picks[q.id] || []).join("");
    const photo = await photoGet(q.id) || (photoOnly ? $("#photoImg").src : "");
    if (!photo && !work && !picks) {
      const box = $("#aiResult"); box.hidden = false;
      box.textContent = "请先在作答区写下答案（作文/翻译直接输入），或上传作答照片，再点 AI 评核。";
      return;
    }
    const btn = photoOnly ? $("#aiGrade") : $("#aiAsk");
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = "AI 评核中…";
    const box = $("#aiResult"); box.hidden = false; box.innerHTML = '<span class="spinner"></span> AI 正在识别作答并评分…';
    try {
      const r = await fetch(AI_ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: q.subject, subjectName: q.subjectName, kp: q.kpName, kind: q.kind,
          question: (q.passage ? q.passage + "\n\n" : "") + q.text,
          answer: q.answer, steps: q.steps, maxScore: q.maxScore, difficulty: q.difficulty,
          selected: picks,
          work, image: photo || "",
        }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || `HTTP ${r.status}`);
      const score = data.score != null ? `<span class="score">${data.score}${data.maxScore ? " / " + data.maxScore : ""}</span>` : "";
      const assumed = data.maxScoreAssumed ? ` <span class="ai-note">（按试卷结构估算满分 ${data.maxScore} 分）</span>` : "";
      const lvl = data.level ? `<b>${esc(data.level)}</b> · ` : "";
      let html = score + assumed + lvl + esc(data.comments || "评核完成");
      if (data.missing) html += `<div class="ai-sec"><b>缺失/错误</b><br>${esc(data.missing).replace(/\n/g, "<br>")}</div>`;
      if (data.suggestions) html += `<div class="ai-sec"><b>修改建议</b><br>${esc(data.suggestions).replace(/\n/g, "<br>")}</div>`;
      if (data.revised) html += `<div class="ai-sec"><b>润色参考</b><div class="ai-revised">${esc(data.revised).replace(/\n/g, "<br>")}</div></div>`;
      box.innerHTML = html;
    } catch (e) {
      box.textContent = `AI 评核失败：${e.message}。请确认已登录，且站点已配置 AI Key。`;
    } finally {
      btn.disabled = false; btn.textContent = old;
    }
  }
  /* ---------- full-page image viewer ---------- */
  function openBigImage(q, fallback) {
    const url = (q && q.pageImage) || fallback;
    if (!url) return;
    $("#imgBig").src = url;
    $("#imgBig").classList.remove("zoom");
    $("#imgCap").textContent = `原题整页 · ${q ? q.chapterTitle + " · " + q.kpName : ""}`;
    const pdf = $("#imgPdf");
    if (q && q.sourcePdf) {
      pdf.href = encodeURI(q.sourcePdf) + "#page=" + (q.sourcePage || 1);
      pdf.hidden = false;
    } else {
      pdf.hidden = true;
    }
    $("#imgModal").hidden = false;
  }
  function closeBigImage() { $("#imgModal").hidden = true; $("#imgBig").removeAttribute("src"); }
  $("#imgClose").addEventListener("click", closeBigImage);
  $("#imgModal").addEventListener("click", e => { if (e.target === $("#imgModal")) closeBigImage(); });
  $("#imgBig").addEventListener("click", () => $("#imgBig").classList.toggle("zoom"));
  $("#pbig").addEventListener("click", () => openBigImage(current(), null));
  $("#qfigs").addEventListener("click", e => {
    const img = e.target.closest("img");
    if (img) openBigImage(current(), img.getAttribute("src"));
  });

  /* ---------- events ---------- */
  $("#modeTabs").addEventListener("click", e => {
    const b = e.target.closest("[data-mode]"); if (b) setMode(b.dataset.mode);
  });
  $("#fSubject").addEventListener("change", e => {
    state.subject = e.target.value; state.kp = "";
    if (state.mode === "paper") renderPaperOptions(); else renderChapterOptions();
    $("#countRow").hidden = state.mode === "paper" || (state.mode === "diagnostic" && state.subject !== "mechanics");
    updateCount();
  });
  $("#fChapter").addEventListener("change", e => { state.chapter = e.target.value; state.kp = ""; updateCount(); });
  $("#fBank").addEventListener("change", e => { state.bank = e.target.value; renderChapterOptions(); updateCount(); });
  $("#fPaper").addEventListener("change", e => { state.paper = e.target.value; updateCount(); });
  $("#fDiff").addEventListener("change", e => { state.diff = e.target.value; updateCount(); });
  $("#fSource").addEventListener("change", e => { state.source = e.target.value; updateCount(); });
  $("#fCount").addEventListener("click", e => {
    const b = e.target.closest("[data-n]"); if (!b) return;
    state.count = Number(b.dataset.n);
    $$("#fCount button").forEach(x => x.classList.toggle("on", x === b));
    updateCount();
  });
  $("#pstart").addEventListener("click", () => start());
  $("#prev").addEventListener("click", () => go(session.i - 1));
  $("#next").addEventListener("click", () => go(session.i + 1));
  $("#reveal").addEventListener("click", () => { if (session.ended) { $("#exam").hidden = true; $("#result").hidden = false; renderResult(); } else showSolution(false); });
  $("#submitBtn").addEventListener("click", requestSubmit);
  $("#sideSubmit").addEventListener("click", requestSubmit);
  $("#exitBtn").addEventListener("click", requestExit);
  $("#tocBtn").addEventListener("click", () => {
    const hidden = !$("#sheet").hidden;
    $("#sheet").hidden = hidden;
    $("#examGrid").classList.toggle("sheet-hidden", hidden);
    $("#tocBtn").textContent = hidden ? "目录" : "收起目录";
  });
  $("#qgrid").addEventListener("click", e => {
    const b = e.target.closest("[data-i]"); if (b) go(Number(b.dataset.i));
  });
  function chooseOption(letter) {
    const q = current();
    if (!q || !session || session.ended) return;
    if (!OBJ_KINDS.includes(q.kind)) return;
    const multi = isMulti(q);
    let picks = session.picks[q.id] || [];
    if (multi) picks = picks.includes(letter) ? picks.filter(x => x !== letter) : picks.concat(letter);
    else picks = picks.includes(letter) ? [] : [letter];
    session.picks[q.id] = picks.sort();
    $("#qtext").innerHTML = questionHTML(q);
    renderMath($("#qtext"));
    renderSheet();
  }
  $("#qtext").addEventListener("click", e => {
    const btn = e.target.closest("[data-opt]");
    if (btn) chooseOption(btn.dataset.opt);
  });
  $("#gradebar").addEventListener("click", e => {
    const b = e.target.closest("[data-grade]"); if (b && !b.disabled) grade(b.dataset.grade);
  });
  $("#work").addEventListener("input", e => { if (session) session.notes[current().id] = e.target.value; });
  $("#aiAsk").addEventListener("click", () => { const q = current(); if (session.ended && ["english", "english2"].includes(q.subject) && /翻译|作文/.test(q.kind)) window.AtlasCoach.open({subject:q.subject, question:q, work:session.notes[q.id] || "", attemptId:session.attempt && session.attempt.id}); else aiGrade(false); });
  function choosePhoto(input) {
    if (!session || session.ended) return;
    input._target = { session, id: current().id };
    input.click();
  }
  $("#photoTake").addEventListener("click", () => choosePhoto($("#photoCamera")));
  $("#photoPick").addEventListener("click", () => choosePhoto($("#photoFile")));
  async function onPhotoChange(e) {
    const input = e.target, target = input._target;
    const file = input.files && input.files[0];
    input.value = ""; input._target = null;
    if (!file || !target || session !== target.session || session.ended) return;
    const url = await fileToDataUrl(file);
    if (!url || session !== target.session || session.ended) return;
    await photoPut(target.id, url);
    if (session === target.session && !session.ended && current().id === target.id) showPhoto(url);
  }
  $("#photoCamera").addEventListener("change", onPhotoChange);
  $("#photoFile").addEventListener("change", onPhotoChange);
  $("#photoRemove").addEventListener("click", async () => {
    if (!session) return;
    await photoDel(current().id); showPhoto(null);
  });
  $("#aiGrade").addEventListener("click", aiGrade);

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("#imgModal").hidden) { closeBigImage(); return; }
    if (!session || session.ended || $("#exam").hidden) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
    if (e.code === "Space" && !sealed()) { e.preventDefault(); if ($("#solution").hidden) showSolution(false); return; }
    if (!$("#solution").hidden && !session.status[current().id]) {
      if (e.key === "1") { e.preventDefault(); grade("ok"); return; }
      if (e.key === "2") { e.preventDefault(); grade("wrong"); return; }
      if (e.key === "3") { e.preventDefault(); grade("fuzzy"); return; }
    }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(session.i - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(session.i + 1); }
    else if (e.key === "Enter") { e.preventDefault(); go(session.i + 1); }
  });

  function init() {
    $("#pintro").textContent = `共 ${ITEMS.length} 题：数学 ${ITEMS.filter(i => i.subject === "math").length}、英语 ${ITEMS.filter(i => i.subject === "english").length}、材力 ${ITEMS.filter(i => i.subject === "mechanics").length}、政治 ${ITEMS.filter(i => i.subject === "politics").length}。按知识点刷有答题卡目录；按套卷刷为纯净全屏，套卷还附带 ${PAPERS.real.length} 套真题原卷与 ${PAPERS.mock.length} 套模拟卷。`;
    populateSubjects();
    const params = new URLSearchParams(location.search);
    if (SUBJECTS.some(s => s.id === params.get("subject"))) state.subject = params.get("subject");
    $("#fSubject").value = state.subject; renderChapterOptions();
    if (params.get("chapter")) { state.chapter = params.get("chapter"); if (![...$("#fChapter").options].some(o => o.value === state.chapter)) $("#fChapter").add(new Option(state.chapter, state.chapter)); $("#fChapter").value = state.chapter; }
    state.kp = params.get("kp") || "";
    if ([...$("#fDiff").options].some(o => o.value === params.get("difficulty"))) { state.diff = params.get("difficulty"); $("#fDiff").value = state.diff; }
    updateCount();
    setMode("knowledge");
  }

  async function bootstrap() {
    await window.AtlasUser.ready; DB_NAME = window.AtlasUser.key("atlas-practice-photos");
    store = await window.AtlasUser.load("practice", {rec:{}}) || {rec:{}}; if (!store.rec) store.rec = {};
    try { const data = await window.AtlasUser.json("/api/personal/questions", "GET"); ITEMS.push(...(data.items || []).map(q => ({...q, _bank:"private"}))); } catch (err) { console.error("个人题库加载失败", err); }
    init();
  }
  bootstrap().catch(err => { $("#pintro").textContent = `加载失败：${err.message}`; $("#pstart").disabled = true; });
})();
