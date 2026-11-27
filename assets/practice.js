(function () {
  "use strict";
  const DATA = window.QUESTIONS;
  if (!DATA) return;
  const ITEMS = [];
  let MANIFEST = null;
  if (window.AtlasQuestions) {
    window.AtlasQuestions._sink = items => { ITEMS.push(...(items || []).map(q => ({ ...q, _bank: "public" }))); };
    if ((DATA.items || []).length) window.AtlasQuestions._sink(DATA.items);
  } else {
    ITEMS.push(...(DATA.items || []).map(q => ({ ...q, _bank: "public" })));
  }
  function publicCount(id) {
    if (MANIFEST && MANIFEST.subjects) return id ? (MANIFEST.subjects[id] || 0) : (MANIFEST.total || 0);
    return ITEMS.filter(i => i._bank === "public" && (!id || i.subject === id)).length;
  }
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
  /* 英语点词查义（蓝图 B1）：仅英语一/英语二才动态加载英语专属模块处理原文，
   * 其他科目的 passage 渲染不进此分支、行为一字不变；词表由模块内部懒加载。 */
  let engWordsPromise = null;
  function enhanceEnglishWords(el) {
    const opts = { exam: !!(session && session.exam) }; // 考场模拟（真题/随机组卷）一律不提示
    if (window.EnglishWords) { window.EnglishWords.enhance(el, opts); return; }
    if (!engWordsPromise) {
      engWordsPromise = new Promise(res => {
        const sc = document.createElement("script");
        sc.src = "assets/english-words.js?v=3";
        sc.onload = res;
        sc.onerror = res;
        document.head.appendChild(sc);
      });
    }
    engWordsPromise.then(() => {
      const cq = current();
      if (window.EnglishWords && cq && ["english", "english2"].includes(cq.subject)) window.EnglishWords.enhance(el, opts);
    });
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
  function questionHTML(q, fillMode) {
    const stem = [];
    const opts = [];
    for (const ln of String(q.text || "").split("\n")) {
      const m = /^([A-H])[.．、]\s*(.*)$/.exec(ln.trim());
      if (m) opts.push({ l: m[1], t: m[2] });
      else stem.push(ln);
    }
    let bi = 0;
    const parts = stem.filter(l => l.trim()).map(l => {
      let h = inline(l);
      if (fillMode) h = h.replace(/[_＿]{3,}/g, () => `<input class="blank-in" data-bi="${bi++}" type="text" autocomplete="off" spellcheck="false" aria-label="第${bi}空">`);
      return `<p>${h}</p>`;
    }).join("");
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
  /* 填空题分空作答：题干下划线空位（___ 或 ＿＿＿）渲染成内嵌输入框，答案按
   * 「第1空：…；第2空：…」拼回 notes，提交/批改链路与原文本框完全一致。
   * 任一空位落在数学公式 \\(...\\) 内时整题回退普通文本框（公式渲染会吞掉输入框）。 */
  function fillBlankCount(q) {
    if (!q || q.kind !== "填空题") return 0;
    const text = String(q.text || "");
    const spans = [];
    const mre = /\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|\$[^$\n]*?\$/g;
    let m; while ((m = mre.exec(text))) spans.push([m.index, m.index + m[0].length]);
    let n = 0;
    const bre = /[_＿]{3,}/g;
    while ((m = bre.exec(text))) {
      if (spans.some(([a, b]) => m.index >= a && m.index < b)) return 0;
      n++;
    }
    return n;
  }
  function blankValues(notes, n) {
    const out = Array.from({ length: n }, () => "");
    const t = String(notes || "").trim();
    if (!t) return out;
    t.split(/；|;/).map(x => x.trim()).forEach((part, i) => {
      const v = part.replace(/^第\d+空：/, "").replace(/^（未填）$/, "");
      if (i < n) out[i] = v;
      else if (n) out[n - 1] = out[n - 1] ? out[n - 1] + "；" + v : v;
    });
    return out;
  }
  function composeBlanks(values) {
    let last = -1;
    values.forEach((v, i) => { if (String(v).trim()) last = i; });
    if (last < 0) return "";
    return values.slice(0, last + 1).map((v, i) => `第${i + 1}空：${String(v).trim() || "（未填）"}`).join("；");
  }
  let lastBlank = null;
  function currentBlanks() { return $$("#qtext .blank-in"); }
  function syncBlanks() {
    if (!session) return;
    const q = current(); if (!q) return;
    session.notes[q.id] = composeBlanks(currentBlanks().map(i => i.value));
    updateBlankPreview();
  }
  function updateBlankPreview() {
    const el = $("#blankPreview"); if (!el || !session) return;
    const values = currentBlanks().map(i => i.value);
    if (!values.some(v => v.trim())) { el.textContent = "（还没填）"; return; }
    el.innerHTML = values.map((v, i) => {
      const t = v.trim();
      const body = !t ? "（未填）" : (/\\|[\^_]\{|[\^_][a-zA-Z0-9]/.test(t) ? `\\(${esc(t)}\\)` : esc(t));
      return `第${i + 1}空 ${body}`;
    }).join("；");
    renderMath(el);
  }
  function setupFill(q, n) {
    const bar = $("#blankBar");
    const area = document.querySelector(".workarea");
    if (area) area.classList.toggle("fill-mode", n > 0);
    if (area) area.classList.toggle("obj-mode", n === 0 && isObjective(q)); // 客观题只给选项：整块作答区（关键步骤/拍照）不渲染
    if (bar) bar.hidden = !(n > 0);
    if (!(n > 0)) return;
    const values = blankValues(session.notes[q.id], n);
    currentBlanks().forEach((inp, i) => { inp.value = values[i] || ""; inp.disabled = !!session.ended; });
    updateBlankPreview();
  }
  const BLANK_TOOLS = [
    ["分数", "\\frac{}{}", 6], ["根号", "\\sqrt{}", 6], ["次方", "^{}", 2], ["平方", "^{2}", -1],
    ["下标", "_{}", 2], ["π", "\\pi", -1], ["≤", "\\le", -1], ["≥", "\\ge", -1],
    ["∞", "\\infty", -1], ["∫", "\\int", -1], ["∑", "\\sum", -1], ["α", "\\alpha", -1],
    ["β", "\\beta", -1], ["θ", "\\theta", -1], ["λ", "\\lambda", -1], ["μ", "\\mu", -1],
    ["·", "\\cdot", -1], ["×", "\\times", -1], ["→", "\\to", -1], ["'", "'", -1],
  ];
  function buildBlankTools() {
    const box = $("#blankTools"); if (!box || box.childElementCount) return;
    for (const [label, ins, cur] of BLANK_TOOLS) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "blank-tool"; b.textContent = label; b.tabIndex = -1;
      b.addEventListener("mousedown", e => e.preventDefault());
      b.addEventListener("click", () => {
        const inputs = currentBlanks(); if (!inputs.length) return;
        const inp = (lastBlank && inputs.includes(lastBlank)) ? lastBlank : (inputs.find(i => !i.value.trim()) || inputs[0]);
        inp.focus();
        const st = inp.selectionStart != null ? inp.selectionStart : inp.value.length;
        const en = inp.selectionEnd != null ? inp.selectionEnd : inp.value.length;
        inp.value = inp.value.slice(0, st) + ins + inp.value.slice(en);
        const pos = cur >= 0 ? st + cur : st + ins.length;
        try { inp.setSelectionRange(pos, pos); } catch (e) {}
        syncBlanks();
      });
      box.appendChild(b);
    }
  }

  const KEY = "atlas.practice.v1";
  const AI_ENDPOINT = (window.ATLAS_CONFIG && window.ATLAS_CONFIG.gradeEndpoint) || "";

  let IS_GUEST = false; // 游客（未登录）：题库走真题分片，套卷不列模拟卷，个人区选项隐藏
  const state = { mode: "knowledge", subject: "all", chapter: "all", kp: "", bank: "all", paper: "all", diff: "all", source: "all", count: 10 };
  let session = null;
  const photoCount = {}; // 每题已传照片数（内存镜像，供已答判定同步读取）
  let timerId = null;
  let confirmCb = null;
  let mockPreview = [];

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

  const SUBJECT_NAMES = { math: "数学一", math2: "数学二", math3: "数学三", english: "英语一", english2: "英语二", mechanics: "807 材料力学", politics: "政治" };
  const SUBJECTS = Object.keys(SUBJECT_NAMES).map(id => ({
    id, name: SUBJECT_NAMES[id], count: ITEMS.filter(i => i.subject === id).length,
  }));

  function populateSubjects() {
    const priv = id => ITEMS.filter(i => i._bank === "private" && (!id || i.subject === id)).length;
    $("#fSubject").innerHTML = `<option value="all">全部科目（${publicCount("") + priv("")}）</option>` +
      SUBJECTS.filter(s => !(window.ATLAS_CONTEST && publicCount(s.id) + priv(s.id) === 0)) // 参赛版只放公共课：题量为 0 的科目（如 807）不列
        .map(s => `<option value="${s.id}">${esc(s.name)}（${publicCount(s.id) + priv(s.id)}）</option>`).join("");
  }

  function isPaperChapter(id) {
    // 年份真题章（math-2025 等）直接认定为套卷：数学真题带 kp 打标、kpName 是知识点名，
    // 过不了下面的旧口径，这正是数学真题一度进不了套卷/真题模拟的原因。
    if (/^(math|math2|math3|eng|eng2|pol|807)-\d{4}$/.test(id || "")) return true;
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
  const inTopicMode = i => i._bank === "private" || !isPaperChapter(i.chapter) || !!i.topicChapter;

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
    const examOnly = state.mode === "exampaper"; // 真题模拟只列已逐题录入的真题（原卷 PDF 不能逐题作答批改，不列）
    const list = paperList().filter(p => state.subject === "all" || p.subject === state.subject);
    const real = [];
    const transcribed = new Set();
    list.filter(p => !p.mock).forEach(p => {
      if (p.year) transcribed.add(`${p.subject}:${p.year}`);
      real.push({ value: p.id, year: p.year || 0,
        label: `${p.title} · ${p.count} 题 · 可刷题` });
    });
    if (!examOnly) PAPERS.real.forEach((p, i) => {
      const sid = p.subjectId || "math";
      if (state.subject !== "all" && state.subject !== sid) return;
      if (transcribed.has(`${sid}:${p.year}`)) return;
      real.push({ value: `pdf:real:${i}`, year: p.year || 0,
        label: `${p.title} · 原卷 ${p.pages} 页` });
    });
    real.sort((a, b) => b.year - a.year || a.label.localeCompare(b.label));

    const mock = (examOnly || IS_GUEST) ? [] : list.filter(p => p.mock)
      .map(p => ({ value: p.id, label: `${p.title} · ${p.count} 题 · 可刷题` }));
    if (!examOnly && !IS_GUEST && (state.subject === "all" || state.subject === "math")) {
      const mockTitles = list.filter(p => p.mock).map(p => p.title);
      PAPERS.mock.forEach((p, i) => {
        const sid = p.subjectId || "math";
        if (state.subject !== "all" && state.subject !== sid) return;
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
    if (state.mode === "paper" || state.mode === "exampaper") {
      if (state.paper === "all") return [];
      return ITEMS.filter(i => (state.bank === "all" || i._bank === state.bank) && i.chapter === state.paper &&
        (state.subject === "all" || i.subject === state.subject));
    }
    return ITEMS.filter(i => {
      if (state.bank !== "all" && i._bank !== state.bank) return false;
      if (state.mode === "knowledge" && !inTopicMode(i)) return false;
      if ((state.mode === "ability" || state.mode === "exampaper") && state.subject === "all") return false;
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
    if ((state.mode === "paper" || state.mode === "ability" || state.mode === "exampaper") && state.subject === "all") {
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
    if ((state.mode === "paper" || state.mode === "exampaper") && state.paper === "all") {
      $("#pcount").textContent = state.mode === "exampaper" ? "真题模拟：请先在「套卷」里选一份真题" : "套卷模式：请先在「套卷」里选一份完整试卷";
      $("#pstart").disabled = true;
      return 0;
    }
    const pool = currentPool();
    if (state.mode === "ability") {
      const groups = mockGroups(state.subject), selected = abilityPool(pool, state.subject);
      mockPreview = selected;
      const counts = groups && groups.map(g => { const available = selected.filter(q => g.kinds.includes(q.kind)).length; return `${g.name} ${available}/${g.count}${available < g.count ? "（缺题）" : ""}`; });
      const missing = selected.filter(q => !Number.isFinite(Number(q.maxScore)) || q.maxScore == null || Number(q.maxScore) <= 0).length;
      const knownMax = selected.filter(q => q.maxScore != null && Number.isFinite(Number(q.maxScore)) && Number(q.maxScore) > 0).reduce((sum,q) => sum + Number(q.maxScore), 0);
      const missingNo = selected.filter(q => paperNo(q) === 9999).length;
      info.textContent = (counts ? `能力测试从全题库按正式考试结构组卷，限时 180 分钟，时间到自动交卷。题型配额：${counts.join("；")}。${["math", "math2", "math3"].includes(state.subject) ? "卷面顺序照真题规律排：每类题内高数→线代→概率，板块题量照 2024/2025 真题配比；每类题内按难度由易到难排，呈难度梯度。" : state.subject === "politics" ? "卷面顺序照真题规律排：每类题内马原→毛中特/习思想→史纲→思修→时政；每类题内按难度由易到难排，呈难度梯度。" : ""}${["english", "english2"].includes(state.subject) ? "完形、阅读、新题型按原文及完整题组抽取，英语一翻译按原卷题组抽取；原文或题目不全的不计入。" : ""}` : `能力测试限时 180 分钟，时间到自动交卷。材料力学未设统一题型配额，按难度由易到难排（同难度按原卷题号），${missingNo} 题题号待核并排在末尾，题量由下方选择。`) + `实际抽取 ${selected.length} 题，已知满分合计 ${knownMax} 分，其中 ${missing} 题满分待核；${counts ? "未列入的题型不计入模考。" : ""}`;
      info.hidden = false; $("#pcount").textContent = `当前可组卷：${selected.length} 题`;
      $("#pstart").disabled = !selected.length; return selected.length;
    }
    if (state.mode === "paper" || state.mode === "exampaper") { const missing = pool.filter(q => q.maxScore == null || !Number.isFinite(Number(q.maxScore)) || Number(q.maxScore) <= 0).length; const counts = {}; pool.forEach(q => { const kind = q.kind || "未分类"; counts[kind] = (counts[kind] || 0) + 1; }); const known = pool.filter(q => q.maxScore != null && Number.isFinite(Number(q.maxScore)) && Number(q.maxScore) > 0).reduce((sum,q) => sum + Number(q.maxScore),0); const no = pool.filter(q => paperNo(q) === 9999).length; const comp = `原卷录入 ${n} 题：${Object.entries(counts).map(([k,v]) => `${k} ${v} 题`).join("；")}。已知满分合计 ${known} 分，${missing} 题满分待核；${no} 题题号待核并排在末尾。`; info.textContent = state.mode === "exampaper" ? `真题模拟：整套真题按考场规矩来——限时 180 分钟，时间到自动交卷；交卷前不能看解析，查词、背题、考点直达全部关闭，中途退出不保存成绩。${comp}` : comp; info.hidden = false; }
    $("#pcount").textContent = (state.mode === "paper" || state.mode === "exampaper") ? `本套卷：${n} 题` : `当前可组卷：${n} 题`;
    $("#pstart").disabled = n === 0;
    return n;
  }

  function setMode(mode) {
    state.mode = mode;
    $$("#modeTabs button").forEach(b => b.classList.toggle("on", b.dataset.mode === mode));
    const paper = mode === "paper" || mode === "exampaper";
    $("#rowChapter").hidden = paper || mode === "ability";
    $("#rowPaper").hidden = !paper;
    $("#rowDiff").hidden = paper;
    $("#rowSource").hidden = paper;
    $("#countRow").hidden = paper || (mode === "ability" && state.subject !== "mechanics");
    $("#paperNote").hidden = mode !== "paper";
    if (paper) renderPaperOptions();
    updateCount();
  }

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function paperNo(q) {
    const m = /第\s*(\d+)\s*题/.exec(q.kpName || "");
    const tail = /-(\d+)$/.exec(q.id || ""); // 数学真题 kpName 是知识点名、无题号，id 尾数即原卷题序（math-2025-7 → 7）
    const value = q.questionNo || q.paperNo || (m && m[1]) || (tail && tail[1]);
    return Number(value) || 9999;
  }

  function stratified(pool, count) {
    const groups = new Map();
    shuffle(pool.slice()).forEach(q => { const key = `${topicOf(q) || "未分类"}|${q.year || (q.isReal || q.isMock ? q.chapter : "知识点")}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(q); });
    const buckets = shuffle([...groups.values()]), out = [];
    while (buckets.length && (!count || out.length < count)) for (let i = buckets.length - 1; i >= 0 && (!count || out.length < count); i--) { out.push(buckets[i].pop()); if (!buckets[i].length) buckets.splice(i, 1); }
    return out;
  }
  function mockGroups(subject) {
    if (["math", "math2", "math3"].includes(subject)) return [
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
  /* 卷面顺序调研（2024/2025 真题逐题统计）：考研卷面不只是题型结构，
   * 每类题内部还有固定的知识板块顺序——数学：高数（math-01~08）→ 线代（09~13）→ 概率（14~20）；
   * 政治：马原（pol-01/02）→ 毛中特（03）/习思想（04）→ 史纲（05）→ 思修（06）→ 时政（07）。
   * 数学每类题的板块题量也照真题配比（数一/数三选择 4/3/3、填空 4/1/1、解答 4/1/1；数二无概率，选择 7/3、填空 5/1、解答 5/1）。 */
  const MATH_AREA_QUOTA = {
    math: { "选择题": [4, 3, 3], "填空题": [4, 1, 1], "解答题": [4, 1, 1] },
    math3: { "选择题": [4, 3, 3], "填空题": [4, 1, 1], "解答题": [4, 1, 1] },
    math2: { "选择题": [7, 3], "填空题": [5, 1], "解答题": [5, 1] }
  };
  function mathArea(q) {
    const m = /math-(\d+)/.exec(q.kpChapter || q.topicChapter || "");
    if (m) { const n = Number(m[1]); return n <= 8 ? 0 : n <= 13 ? 1 : 2; }
    const t = `${q.kpName || ""} ${q.chapterTitle || ""}`;
    if (/概率|随机变量|统计|分布|期望|方差/.test(t)) return 2;
    if (/行列式|矩阵|向量组|线性方程组|特征值|二次型|线性代数/.test(t)) return 1;
    return 0;
  }
  function polRank(q) {
    const m = /pol-(\d+)/.exec(q.kpChapter || q.topicChapter || "");
    if (!m) return 5;
    const n = Number(m[1]);
    return n <= 2 ? 0 : n <= 4 ? 1 : n === 5 ? 2 : n === 6 ? 3 : 4;
  }
  function orderSection(list, subject) {
    if (subject === "politics") return list.slice().sort((a, b) => polRank(a) - polRank(b));
    return list;
  }
  function mathSectionPick(candidates, subject, g) {
    const quota = (MATH_AREA_QUOTA[subject] || {})[g.name];
    if (!quota) return stratified(candidates, g.count);
    const byArea = [[], [], []];
    candidates.forEach(q => byArea[mathArea(q)].push(q));
    const picked = [];
    quota.forEach((want, area) => { picked.push(...stratified(byArea[area], Math.min(want, byArea[area].length))); });
    if (picked.length < g.count) { // 某板块题量不足时从其余板块补足，本类总题量不变
      const rest = candidates.filter(q => !picked.includes(q));
      picked.push(...stratified(rest, g.count - picked.length));
    }
    return picked.slice().sort((a, b) => mathArea(a) - mathArea(b)); // 稳定排序：板块内保留抽题随机序
  }
  function mockPool(pool, subject) {
    const single = pool.filter(q => q.subject === subject), groups = mockGroups(subject);
    if (groups) return groups.flatMap(g => {
      const candidates = single.filter(q => g.kinds.includes(q.kind));
      if (["math", "math2", "math3"].includes(subject)) return mathSectionPick(candidates, subject, g);
      if (subject === "politics") return orderSection(stratified(candidates, g.count), subject);
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
  const DIFF_RANK = { "易": 0, "中": 1, "难": 2, "较难": 3 };
  const diffRank = q => (q.difficulty in DIFF_RANK) ? DIFF_RANK[q.difficulty] : 1;
  /* 能力测试组卷：与随机组卷同一套题量结构与板块顺序（标准试卷结构），在此之上加难度梯度——
   * 同一题型段、同一板块内按难度由易到难排，整卷渐进。英语按原卷题组整组抽取，组内顺序不动。 */
  function abilityPool(pool, subject) {
    const picked = mockPool(pool, subject);
    if (!["math", "math2", "math3", "politics", "mechanics"].includes(subject)) return picked;
    const groups = mockGroups(subject);
    const gIdx = q => { if (!groups) return 0; const i = groups.findIndex(g => g.kinds.includes(q.kind)); return i < 0 ? 99 : i; };
    return picked.slice().sort((a, b) =>
      gIdx(a) - gIdx(b) ||
      (subject === "politics" ? polRank(a) - polRank(b) : ["math", "math2", "math3"].includes(subject) ? mathArea(a) - mathArea(b) : 0) ||
      diffRank(a) - diffRank(b));
  }
  const sealed = () => session && session.mode !== "knowledge" && !session.ended;
  /* 政治背题模式：只在「按知识点刷」+ 政治题上出现。开启后看答案解析不判分、
   * 不写做题记录（rec）、不进错题艾宾浩斯回流，看过的题记 session.peeked 并在交卷时跳过。 */
  const peekApplies = q => !!(session && session.mode === "knowledge" && q && q.subject === "politics");
  const peekOn = q => peekApplies(q) && !!session.peekMode;
  function setExamPure(on) {
    document.body.classList.toggle("exam-pure", !!on);
    try { if (window.AtlasApp && AtlasApp.setExamMode) AtlasApp.setExamMode(!!on); } catch (e) {}
  }

  function start(poolOverride, poolTitle) {
    if ((state.mode === "paper" || state.mode === "ability" || state.mode === "exampaper") && state.subject === "all") return;
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
    if (!poolOverride && state.mode === "ability") pool = mockPreview.slice();
    if (!pool.length || (state.mode !== "knowledge" && pool.some(q => q.subject !== state.subject))) { $("#pcount").textContent = "题型不足或科目不一致，无法组卷"; return; }
    if (!poolOverride && (state.mode === "paper" || state.mode === "exampaper")) pool = pool.slice().sort((a, b) => paperNo(a) - paperNo(b));
    $("#sideSubmit").hidden = false;
    const isExam = state.mode === "ability" || state.mode === "exampaper";
    session = { queue: pool, i: 0, status: {}, notes: {}, picks: {}, locked: {}, peekMode: false, peeked: {}, startTime: Date.now(), ended: false, mode: state.mode, exam: isExam, limitSec: isExam ? MOCK_SECONDS : 0, subject: state.subject, structure: $("#structureInfo").hidden ? "" : $("#structureInfo").textContent };
    Object.keys(photoCount).forEach(k => { delete photoCount[k]; });
    const sub = SUBJECTS.find(s => s.id === state.subject);
    const title = poolTitle || (poolOverride ? "错题重练" : (state.mode === "ability" ? `${sub ? sub.name : state.subject} · 能力测试` : state.mode === "exampaper" ? `${pool[0].chapterTitle} · 真题模拟` : state.mode === "paper" ? pool[0].chapterTitle
      : (state.chapter !== "all" ? pool[0].chapterTitle
        : (sub ? sub.name : "全科综合"))));
    $("#paperTitle").textContent = `${title} · ${pool.length} 题`;
    $("#setup").hidden = true;
    $("#result").hidden = true;
    $("#exam").hidden = false;
    $("#submitBtn").hidden = false;
    $("#exitBtn").hidden = false;
    $("#bankLink").hidden = true;
    $("#examGrid").classList.toggle("paper-mode", state.mode === "paper");
    setExamPure(session.exam);
    document.body.classList.toggle("paper-run", state.mode === "paper");
    // 套卷模式也给题号目录：默认收起，点「目录」展开
    $("#tocBtn").hidden = false;
    const sheetHidden = state.mode === "paper" || window.matchMedia("(max-width: 1000px)").matches;
    $("#sheet").hidden = sheetHidden;
    $("#examGrid").classList.toggle("sheet-hidden", sheetHidden);
    $("#tocBtn").textContent = "目录";
    $("#timer").textContent = session.limitSec ? fmtClock(session.limitSec) : "00:00";
    $("#timer").classList.remove("warn", "danger");
    if (timerId) clearInterval(timerId);
    timerId = setInterval(tick, 1000);
    window.scrollTo({ top: 0 });
    renderSheet();
    renderQuestion();
  }

  const MOCK_SECONDS = 180 * 60;
  function fmtClock(sec) {
    sec = Math.max(0, sec);
    return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  }
  function tick() {
    if (!session || session.ended) return;
    const sec = Math.floor((Date.now() - session.startTime) / 1000);
    const el = $("#timer");
    if (session.exam && session.limitSec) {
      const left = session.limitSec - sec;
      el.textContent = fmtClock(left);
      el.classList.toggle("warn", left <= 1800 && left > 600);
      el.classList.toggle("danger", left <= 600);
      if (left <= 0 && !session.submitting) { session.timeUp = true; doSubmit(); }
      return;
    }
    el.textContent = fmtClock(sec);
  }

  /* 已答判定（统一口径）：选了选项 / 写了作答（作文、翻译、填空都同步进 notes）/
   * 传了照片 / 已自评出状态，任一成立即已答。答题卡、顶部计数、交卷提醒共用此口径，
   * 避免「格子显示未答、交卷却按已答批改」或反过来的不一致。 */
  function qAnswered(q) {
    return (session.picks[q.id] || []).length > 0
      || String(session.notes[q.id] || "").trim().length > 0
      || (photoCount[q.id] || 0) > 0
      || !!session.status[q.id];
  }
  function refreshSheetOnAnswerChange(q, before) {
    if (session && !session.ended && qAnswered(q) !== before) renderSheet();
  }

  function renderSheet() {
    const qs = session.queue;
    $("#sheetMeta").textContent = `${qs.length} 题`;
    const ended = !!(session && session.ended);
    $("#qgrid").innerHTML = qs.map((q, i) => {
      const st = session.status[q.id] || "";
      const answered = qAnswered(q);
      // 交卷前只显示「未答 / 已答」，不泄露对错；交卷后显示 ok/wrong
      const cls = ended ? st : (answered ? "answered" : "");
      const pk = session.peeked && session.peeked[q.id] ? " peeked" : "";
      return `<button class="qbtn ${cls}${pk} ${i === session.i ? "cur" : ""}" data-i="${i}">${i + 1}</button>`;
    }).join("");
    const ok = qs.filter(q => session.status[q.id] === "ok").length;
    const wrong = qs.filter(q => session.status[q.id] === "wrong").length;
    const fuzzy = qs.filter(q => session.status[q.id] === "fuzzy").length;
    if (ended) {
      $("#sheetStats").innerHTML = `已做 ${ok + wrong + fuzzy} / ${qs.length}<br>对 ${ok} · 错 ${wrong}${fuzzy ? ` · 模糊 ${fuzzy}` : ""}`;
    } else {
      const answered = qs.filter(q => qAnswered(q)).length;
      $("#sheetStats").innerHTML = `已答 ${answered} / ${qs.length}<br>交卷后统一判分`;
    }
  }

  /* 查词段位（英语专属）：青铜全文可点 / 黄金只提示生僻词与生词本词 / 王者不提示；
   * 全真模考一律关闭（模块侧 opts.exam 硬关，这里只显示关闭说明）。段位存 vocab 状态。 */
  const HINT_NOTES = {
    bronze: "青铜：全文单词可点查释义",
    gold: "黄金：只提示生僻词和生词本里的词",
    king: "王者：不提示，硬读原文"
  };
  let hintLevelCur = "bronze";
  function renderHintLevel() {
    const box = $("#hintLevel"); if (!box) return;
    const q = session && !session.ended ? current() : null;
    if (!q || !["english", "english2"].includes(q.subject)) { box.hidden = true; return; }
    box.hidden = false;
    const btns = $("#hintLevelBtns"), note = $("#hintLevelNote");
    if (session.exam) {
      btns.style.display = "none";
      note.textContent = "考场模拟：查词提示已关闭";
      return;
    }
    btns.style.display = "";
    note.textContent = HINT_NOTES[hintLevelCur] || "";
    btns.querySelectorAll("button").forEach(b2 => b2.classList.toggle("on", b2.dataset.lv === hintLevelCur));
    if (window.EnglishWords && window.EnglishWords.level) {
      window.EnglishWords.level().then(lv => {
        if (lv && lv !== hintLevelCur) { hintLevelCur = lv; renderHintLevel(); }
      }).catch(() => {});
    }
  }
  function refreshPassageWords() {
    const q = current(); if (!q || !(q.passage && q.passage.trim())) return;
    const el = $("#qpassagebody"); if (!el) return;
    el.innerHTML = passageHTML(q.passage, q.kind === "完形");
    renderMath(el);
    if (["english", "english2"].includes(q.subject)) enhanceEnglishWords(el);
  }

  function current() { return session.queue[session.i]; }

  function updateSubjectHint(q) {
    const workEl = $("#work");
    if (!workEl || !workEl.parentElement) return;
    let hint = $("#subjectHint");
    if (!hint) {
      hint = document.createElement("div");
      hint.id = "subjectHint";
      hint.style.cssText = "font-size:12px;color:var(--ink3);margin-top:6px;line-height:1.5;";
      workEl.parentElement.insertBefore(hint, workEl.nextSibling);
      workEl.addEventListener("input", () => { const cur = current(); if (cur) updateSubjectHint(cur); });
    }
    if (!q) { hint.textContent = ""; return; }
    const s = q.subject || "", k = q.kind || "";
    if ((s === "english" || s === "english2") && /作文/.test(k)) {
      const words = (workEl.value || "").trim().split(/\s+/).filter(Boolean).length;
      const target = k === "小作文" ? "建议约 100 词 · 满分 10 分" : (s === "english" ? "建议 160–200 词 · 满分 20 分" : "建议约 150 词 · 满分 15 分");
      hint.textContent = `当前字数：${words} 词（${target}）`;
      return;
    }
    if (s === "politics") {
      if (k === "多选题") { hint.textContent = "政治多选题：全对得 2 分，少选、多选或错选均不得分。"; return; }
      if (k === "分析题") { hint.textContent = "政治分析题：满分 10 分，按要点采分并结合材料作答。"; return; }
    }
    if (s === "mechanics" && !OBJ_KINDS.includes(k)) {
      hint.textContent = "807 材料力学：按平衡方程、变形协调、物理关系与单位量纲分步给分（0.5 分步长）。";
      return;
    }
    if (/^math/.test(s) && !OBJ_KINDS.includes(k)) {
      const extra = s === "math2" ? "（数二不含级数与概率）" : (s === "math3" ? "（数三含经济应用与差分方程）" : "");
      hint.textContent = `数学主观题：按步给分（0.5 分步长）${extra}。`;
      return;
    }
    hint.textContent = "";
  }

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
    const fillN = fillBlankCount(q);
    $("#qtext").innerHTML = questionHTML(q, fillN > 0);
    renderMath($("#qtext"));
    setupFill(q, fillN);
    const hasPassage = !!(q.passage && q.passage.trim());
    $("#qpassage").hidden = !hasPassage;
    $("#paperCard").classList.toggle("has-passage", hasPassage);
    if (hasPassage) {
      const isCloze = q.kind === "完形";
      $("#qpassagebody").innerHTML = passageHTML(q.passage, isCloze);
      renderMath($("#qpassagebody"));
      if (["english", "english2"].includes(q.subject)) enhanceEnglishWords($("#qpassagebody"));
      $("#qpassage").open = true;
    }
    renderHintLevel();
    $("#work").value = session.notes[q.id] || "";
    const subjective = isSubjective(q);
    $("#photoBox").hidden = !(subjective || fillN > 0);
    const aiAsk = $("#aiAsk");
    if (aiAsk) {
      aiAsk.hidden = !AI_ENDPOINT;
      aiAsk.textContent = (q.kind === "大作文" || q.kind === "小作文") ? "AI 批改作文"
        : (q.kind === "翻译" ? "AI 核对翻译" : "AI 核对答案");
    }
    showPhotos([]);
    if (subjective || fillN > 0) {
      photoGet(q.id).then(urls => {
        photoCount[q.id] = urls.length;
        if (session && !session.ended) renderSheet();
        if (urls.length && session && current() && current().id === q.id) showPhotos(urls);
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
    updateSubjectHint(q);
    $("#photoTake").hidden = session.ended;
    $("#photoPick").hidden = session.ended;
    if (session.ended && OBJ_KINDS.includes(q.kind)) paintObjective(q);
    if (session.ended) {
      showSolution(true);
      const result = session.attempt && session.attempt.results && session.attempt.results[q.id];
      if (result) {
        const parts = [result.comments, result.missing, result.suggestions, result.revised];
        if (Array.isArray(result.grammar) && result.grammar.length) parts.push("语法问题：\n" + result.grammar.map(g => `${g.original} → ${g.corrected}${g.reason ? `（${g.reason}）` : ""}`).join("\n"));
        if (Array.isArray(result.upgrades) && result.upgrades.length) parts.push("句子升级：\n" + result.upgrades.map(u => `${u.original} → ${u.upgraded}${u.note ? `（${u.note}）` : ""}`).join("\n"));
        $("#aiResult").hidden = false; $("#aiResult").textContent = parts.filter(Boolean).map(function (t) { return window.AtlasPlain ? window.AtlasPlain.clean(t) : t; }).join("\n\n");
      }
      $("#reveal").textContent = "返回结果";
      if (["english", "english2"].includes(q.subject) && /翻译|作文/.test(q.kind)) { $("#aiAsk").hidden = false; $("#aiAsk").textContent = "AI 多轮指导"; }
    } else $("#reveal").textContent = "显示解析（Space）";
    if (!session.ended && peekOn(q)) $("#reveal").textContent = "看答案解析";
    const pkBtn = $("#peekBtn");
    if (pkBtn) {
      pkBtn.hidden = !peekApplies(q) || session.ended;
      pkBtn.classList.toggle("on", !!session.peekMode);
      pkBtn.textContent = session.peekMode ? "背题模式：开" : "背题模式";
    }
    const readCh = q.topicChapter || (q.kp ? q.chapter : "");
    $("#pklink").hidden = !readCh || !!(session && session.exam);
    $("#pklink").href = `index.html#read=${encodeURIComponent(readCh)}` +
      (q.kp ? `&kp=${encodeURIComponent(q.kp)}` : "");
    $("#pbig").hidden = !q.pageImage;
    if (q.sourcePdf) {
      $("#psource").href = encodeURI(q.sourcePdf) + "#page=" + (q.sourcePage || 1);
      $("#psource").hidden = !!(session && session.exam);
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
    /* 背题模式下直接给答案解析：本题记为「看过」，不判分、不写 rec、不进回流（见 doSubmit 与 grade） */
    const peek = peekOn(q);
    if (peek && !alreadyGraded && !session.peeked[q.id]) { session.peeked[q.id] = true; renderSheet(); }
    // 客观题在交卷前不给答案，避免边做边对——交卷后统一揭示（背题模式除外）
    const answerSealed = obj && !session.ended && !peek;
    const ans = (!answerSealed && q.answer)
      ? `<div class="slabel2">${unverified ? "待核参考" : "要点"}</div><div class="sans">${fmt(q.answer)}</div>` : "";
    const steps = (!answerSealed && (q.steps || []).length)
      ? `<div class="slabel2" style="margin-top:10px">完整解答</div><ol class="ssteps">${q.steps.map(s => `<li>${fmt(s)}</li>`).join("")}</ol>` : "";
    const hint = answerSealed
      ? `<div class="sans" style="color:var(--ink3)">客观题答案将在交卷后统一公布。先选好你的答案。</div>`
      : (!q.answer ? `<div class="sans" style="color:var(--ink3)">这题暂无已核对答案，可自评。</div>` : "");
    const warning = !answerSealed && unverified ? `<div class="sans">答案与解析待核，不能作为确定的评分依据。${q.reviewReason ? ` ${esc(q.reviewReason)}` : ""}</div>` : "";
    const peekNote = peek && !session.ended ? `<div class="sans" style="color:var(--ink3)">背题模式：这道题已记为「看过答案」，不会计入做题统计，也不会进错题本。</div>` : "";
    $("#solution").innerHTML = peekNote + warning + ans + steps + hint;
    renderMath($("#solution"));
    $("#solution").hidden = false;
    $("#gradebar").hidden = answerSealed || obj || peek;
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
    if (!q || sealed() || session.ended || session.status[q.id] || peekOn(q)) return;
    session.status[q.id] = kind;
    const r = store.rec[q.id] || { seen: 0, ok: 0, wrong: 0, last: 0 };
    r.seen += 1; r.last = Date.now();
    if (kind === "ok") r.ok += 1; else if (kind === "wrong") r.wrong += 1;
    store.rec[q.id] = r; save();
    if (window.AtlasReview) window.AtlasReview.note(q.id, kind);
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
    const left = session.queue.filter(q => !qAnswered(q)).length;
    askConfirm("交卷", left > 0
      ? `还有 ${left} 题未作答。检查完毕，确认交卷吗？`
      : "已检查完毕，确认交卷吗？", doSubmit);
  }

  async function doSubmit() {
    if (session.submitting) return;
    session.submitting = true;
    if (session.mode === "knowledge") {
      session.queue.forEach(q => { const ans = answerLetters(q), picks = session.picks[q.id] || []; if (!session.status[q.id] && !(session.peeked && session.peeked[q.id]) && ans && picks.length) { const kind = picks.slice().sort().join("") === ans.split("").sort().join("") ? "ok" : "wrong"; session.status[q.id] = kind; const r = store.rec[q.id] || {seen:0, ok:0, wrong:0, last:0}; r.seen++; r[kind]++; r.last = Date.now(); store.rec[q.id] = r; if (window.AtlasReview) window.AtlasReview.note(q.id, kind); } }); save();
      finishSubmit(); return;
    }
    const answers = {};
    for (const q of session.queue) { const imgs = await photoGet(q.id); answers[q.id] = {work:session.notes[q.id] || "", selected:session.picks[q.id] || [], image:imgs[0] || "", images:imgs}; }
    try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch (e) {}
    const id = crypto.randomUUID();
    try {
      const serverGrade = true;
      let aiCfg = null;
      try { const c = window.AtlasAiCfg && window.AtlasAiCfg.get ? window.AtlasAiCfg.get() : null; if (c && c.mode === "user" && c.base && c.key && c.model) aiCfg = { base: c.base, key: c.key, model: c.model }; } catch (e) {}
      const data = await window.AtlasUser.json("/api/attempts", "POST", {id, subject:session.queue[0].subject, mode:session.mode, questions:session.queue, answers, serverGrade, aiCfg});
      session.attempt = data.attempt;
      const hasAnswer = q => qAnswered(q) || (answers[q.id] && answers[q.id].image);
      session.gradeQueue = session.queue.filter(q => hasAnswer(q)).map(q => q.id);
      session.gradeSkipped = session.queue.length - session.gradeQueue.length;
      session.gradeTotal = session.gradeQueue.length;
      session.gradeDone = 0;
      if (window.AtlasGradeBg && !serverGrade) window.AtlasGradeBg.save({ attemptId: id, title: (SUBJECT_NAMES[session.queue[0].subject] || '套卷') + (session.exam ? (session.mode === "exampaper" ? " · 真题模拟" : " · 能力测试") : " · 套卷"), pending: session.gradeQueue.slice(), total: session.gradeTotal });
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
      if (window.AtlasGradeBg) window.AtlasGradeBg.complete(attemptId);
      notifyGradeDone();
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
      if (window.AtlasGradeBg) window.AtlasGradeBg.done(id);
    }
    catch (err) { if (session === active) { session.errors = session.errors || {}; session.errors[id] = err.message; } if (window.AtlasGradeBg) window.AtlasGradeBg.fail(id); }
    finally { if (session === active) { session.grading = null; updateResultStatus(); } }
  }
  function finishSubmit() {
    session.ended = true; session.endTime = Date.now(); if (timerId) clearInterval(timerId);
    $("#submitBtn").hidden = true; $("#exitBtn").hidden = true; $("#tocBtn").hidden = true; $("#exam").hidden = true; $("#result").hidden = false; $("#bankLink").hidden = false; document.body.classList.remove("paper-run"); setExamPure(false); renderResult();
  }
  function qStatus(q) {
    if (session.peeked && session.peeked[q.id]) return "peeked";
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
  function ensureGradePill() {
    let pill = document.getElementById("gradePill");
    if (pill) return pill;
    pill = document.createElement("button");
    pill.id = "gradePill"; pill.type = "button"; pill.hidden = true;
    pill.addEventListener("click", () => {
      pill.hidden = true;
      const box = $("#rprogress");
      if (box) box.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    document.body.appendChild(pill);
    return pill;
  }
  function progressVisible() {
    const box = $("#rprogress");
    if (!box || !$("#result") || $("#result").hidden) return false;
    const r = box.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  }
  function updateGradePill() {
    const pill = ensureGradePill();
    if (!session || !session.gradeTotal) { pill.hidden = true; return; }
    const running = (session.gradeQueue && session.gradeQueue.length) || session.grading;
    const done = Math.min(session.gradeDone || 0, session.gradeTotal || 0);
    if (running) {
      pill.dataset.state = "run";
      pill.textContent = `AI 批改中 ${done} / ${session.gradeTotal} · 点此看进度`;
      pill.hidden = progressVisible();
    } else if (pill.dataset.state === "run" && done >= session.gradeTotal) {
      pill.dataset.state = "done";
      pill.textContent = "✓ 批改完成，点此查看成绩";
      pill.hidden = false;
      setTimeout(() => { if (pill.dataset.state === "done") pill.hidden = true; }, 10000);
    } else if (!running) pill.hidden = true;
  }
  window.addEventListener("scroll", () => { if (session && session.gradeTotal) updateGradePill(); }, { passive: true });
  function notifyGradeDone() {
    if (!document.hidden && progressVisible()) return;
    const bodyTxt = `共 ${session.gradeTotal} 题已批改完成${session.gradeSkipped ? `（未作答 ${session.gradeSkipped} 题未计分）` : ""}，回来看成绩吧。`;
    try { if (window.AtlasApp && AtlasApp.notify) { AtlasApp.notify("批改完成", bodyTxt); return; } } catch (e) {}
    try {
      if ("Notification" in window && Notification.permission === "granted") { new Notification("批改完成", { body: bodyTxt }); return; }
      if (document.hidden) {
        const old = document.title;
        document.title = "✓ 批改完成 · " + old;
        document.addEventListener("visibilitychange", function h() {
          if (!document.hidden) { document.title = old; document.removeEventListener("visibilitychange", h); }
        });
      }
    } catch (e) {}
  }
  function updateResultStatus() {
    updateGradePill();
    if (!session || $("#result").hidden) return;
    const {score, max, completed, missingMax} = resultTotals();
    const total = session.gradeTotal || 0, done = Math.min(session.gradeDone || 0, total);
    const running = (session.gradeQueue && session.gradeQueue.length) || session.grading;
    const sum = $("#rsummary");
    const results = session.attempt && session.attempt.results || {};
    const assumedCount = session.queue.filter(q => { const r = results[q.id]; return r && r.maxScoreAssumed; }).length;
    if (sum) sum.textContent = `已评分 ${completed} / ${session.queue.length} 题 · 已核分值范围 ${score} / ${max} 分 · ${missingMax} 题满分待核${assumedCount ? ` · ${assumedCount} 题按试卷结构估算满分` : ""}${session.gradeSkipped ? ` · 未作答 ${session.gradeSkipped} 题（不批改、记 0 分）` : ""}`;
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
    if (errBox) {
      const errs = Object.keys(session.errors || {});
      errBox.innerHTML = errs.length ? `<p class="rerr">${errs.length} 道题批改未成功（多为网络波动） <button type="button" data-retry-all>重试这 ${errs.length} 道</button></p>` : "";
      const rb = errBox.querySelector("[data-retry-all]");
      if (rb) rb.onclick = () => {
        const ids = Object.keys(session.errors || {});
        ids.forEach(id => delete session.errors[id]);
        session.gradeQueue = (session.gradeQueue || []).concat(ids);
        session.gradeDone = Math.max(0, (session.gradeTotal || 0) - session.gradeQueue.length);
        updateResultStatus();
        runGradeQueue(session.attempt.id);
      };
    }
    const back = $("#backSetup");
    if (back) back.disabled = Boolean(running);
  }
  function renderResult() {
    if (!session || $("#result").hidden) return;
    const masteryWasOpen = !!$("#masteryDialog[open]");
    const results = session.attempt && session.attempt.results || {};
    const structureBrief = session.structure ? session.structure.split("。")[0] + "。" : "";
    $("#result").innerHTML = `<div class="ekicker">${session.exam ? "EXAM SIMULATION" : "RESULT"}</div><h2>${session.exam ? `${session.mode === "exampaper" ? "真题模拟" : "能力测试"} · 交卷完成` : "交卷完成"}</h2>${session.exam ? `<p class="rsum">用时 ${Math.max(1, Math.round(((session.endTime || Date.now()) - session.startTime) / 60000))} 分钟（限时 180 分钟）${session.timeUp ? " · 时间到自动交卷" : ""}</p>` : ""}<p class="rsum">${esc(structureBrief)}</p><div class="rprogress" id="rprogress" hidden><span class="spinner"></span><span class="rcheck" aria-hidden="true">✓</span><span id="rprogressText"></span><div class="rbar"><i id="rprogressBar"></i></div></div><div class="rsum" id="rsummary"></div><div class="rgrid">${session.queue.map((q,i) => `<button class="${qStatus(q)}" data-review="${i}" aria-label="回顾第 ${i+1} 题，${qStatus(q)}">${i+1}</button>`).join("")}</div><p class="rsum">点击任意题号回顾解析和反馈。绿色：正确；红色：错误；其他：待核或部分得分。${Object.keys(session.peeked || {}).length ? "灰色划线：背题模式看过答案，未计入统计。" : ""}</p><div id="rerrors"></div><div id="mastery"></div><div class="racts"><button id="backSetup">再组一卷</button></div>`;
    window.AtlasAssessment.renderMastery(document.getElementById("mastery"), session.queue, results);
    if (masteryWasOpen) $("#masteryDialog").showModal();
    $("#result").querySelectorAll("[data-review]").forEach(b => b.onclick = () => { $("#result").hidden = true; $("#exam").hidden = false; $("#sheet").hidden = false; $("#sideSubmit").hidden = true; session.i = Number(b.dataset.review); renderQuestion(); });
    $("#backSetup").onclick = () => { $("#result").hidden = true; $("#setup").hidden = false; session = null; updateCount(); };
    updateResultStatus();
  }

  function requestExit() {
    askConfirm("退出考试", session && session.exam ? "退出后本次模拟不保存成绩，确定退出吗？" : "已作答内容会保存在本机，确定退出吗？", () => {
      if (timerId) clearInterval(timerId);
      session = null;
      $("#submitBtn").hidden = true;
      $("#exitBtn").hidden = true;
      $("#tocBtn").hidden = true;
      $("#exam").hidden = true;
      $("#setup").hidden = false;
      $("#bankLink").hidden = false;
      document.body.classList.remove("paper-run");
      setExamPure(false);
      updateCount();
    });
  }

  /* ---------- answer photo + AI grading ---------- */
  let DB_NAME;
  const DB_STORE = "photos";
  const MAX_PHOTOS = 6; /* 每题照片上限，与服务端 MAX_ANSWER_IMAGES 对齐；数组顺序即页序 */
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
  /* 本地照片按题存 data URL 数组；兼容旧数据：以前存的是单个字符串，读出时按单图数组返回 */
  async function photoGet(id) {
    try {
      const d = await db();
      const v = await new Promise((resolve, reject) => {
        const tx = d.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(id);
        tx.onsuccess = () => resolve(tx.result || null);
        tx.onerror = () => reject(tx.error);
      });
      if (Array.isArray(v)) return v.filter(s => typeof s === "string" && s);
      return v ? [v] : [];
    } catch (e) { return []; }
  }
  async function photoPut(id, urls) {
    const list = (Array.isArray(urls) ? urls : [urls]).filter(s => typeof s === "string" && s).slice(0, MAX_PHOTOS);
    if (!list.length) return photoDel(id);
    try {
      const d = await db();
      await new Promise((resolve, reject) => {
        const tx = d.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put(list, id);
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
    if (["math", "math2", "math3"].includes(q.subject)) return ["计算题", "证明题", "解答题"].includes(q.kind);
    if (q.subject === "mechanics") return ["计算题", "简答题", "证明题"].includes(q.kind);
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
  let curPhotos = []; /* 当前题的照片数组（顺序即页序），预览、删除与 AI 评卷共用 */
  function updateAIButton() {
    const q = current();
    $("#aiGrade").hidden = !!sealed() || !(q && isSubjective(q) && curPhotos.length && AI_ENDPOINT);
  }
  function showPhotos(urls) {
    curPhotos = Array.isArray(urls) ? urls.slice(0, MAX_PHOTOS) : [];
    const box = $("#photoPreview"), thumbs = $("#photoThumbs");
    box.hidden = !curPhotos.length;
    const canEdit = !!session && !session.ended;
    thumbs.innerHTML = curPhotos.map((u, i) =>
      `<figure class="photo-thumb"><img src="${u}" alt="作答照片第 ${i + 1} 页"><figcaption>第 ${i + 1} 页</figcaption>${canEdit ? `<button type="button" class="photo-del" data-del="${i}" title="删除这一页">×</button>` : ""}</figure>`
    ).join("");
    updateAIButton();
  }
  async function aiGrade(photoOnly) {
    const q = current(); if (!q || sealed() || !AI_ENDPOINT) return;
    const work = ($("#work").value || "").trim();
    const picks = (session && session.picks && session.picks[q.id] || []).join("");
    const photos = await photoGet(q.id);
    if (!photos.length && !work && !picks) {
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
          work, image: photos[0] || "", images: photos,
        }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || `HTTP ${r.status}`);
      const score = data.score != null ? `<span class="score">${data.score}${data.maxScore ? " / " + data.maxScore : ""}</span>` : "";
      const assumed = data.maxScoreAssumed ? ` <span class="ai-note">（按试卷结构估算满分 ${data.maxScore} 分）</span>` : "";
      const lvl = data.level ? `<b>${esc(data.level)}</b> · ` : "";
      let html = score + assumed + lvl + esc(window.AtlasPlain ? window.AtlasPlain.clean(data.comments) : (data.comments || "评核完成"));
      if (data.missing) html += `<div class="ai-sec"><b>缺失/错误</b><br>${esc(window.AtlasPlain ? window.AtlasPlain.clean(data.missing) : data.missing).replace(/\n/g, "<br>")}</div>`;
      if (data.suggestions) html += `<div class="ai-sec"><b>修改建议</b><br>${esc(window.AtlasPlain ? window.AtlasPlain.clean(data.suggestions) : data.suggestions).replace(/\n/g, "<br>")}</div>`;
      if (data.revised) html += `<div class="ai-sec"><b>润色参考</b><div class="ai-revised">${esc(window.AtlasPlain ? window.AtlasPlain.clean(data.revised) : data.revised).replace(/\n/g, "<br>")}</div></div>`;
      if (Array.isArray(data.grammar) && data.grammar.length) html += `<div class="ai-sec"><b>语法问题</b><br>${data.grammar.map(g => `${esc(g.original)} → ${esc(g.corrected)}${g.reason ? `（${esc(g.reason)}）` : ""}`).join("<br>")}</div>`;
      if (Array.isArray(data.upgrades) && data.upgrades.length) html += `<div class="ai-sec"><b>句子升级</b><br>${data.upgrades.map(u => `${esc(u.original)} → ${esc(u.upgraded)}${u.note ? `（${esc(u.note)}）` : ""}`).join("<br>")}</div>`;
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
  $("#fSubject").addEventListener("change", async e => {
    state.subject = e.target.value; state.chapter = "all"; state.paper = "all"; state.kp = "";
    if (window.AtlasQuestions && state.subject !== "all" && !window.AtlasQuestions.isLoaded(state.subject)) {
      $("#pcount").textContent = "正在加载该科目题库…";
      try { await window.AtlasQuestions.load(state.subject); populateSubjects(); $("#fSubject").value = state.subject; }
      catch (err) { console.error("题库分片加载失败", err); }
    }
    if (state.mode === "paper" || state.mode === "exampaper") renderPaperOptions(); else renderChapterOptions();
    $("#countRow").hidden = state.mode === "paper" || state.mode === "exampaper" || (state.mode === "ability" && state.subject !== "mechanics");
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
  $("#pstart").addEventListener("click", async () => {
    if (window.AtlasQuestions) {
      try {
        if (state.subject === "all") await window.AtlasQuestions.load("all");
        else if (!window.AtlasQuestions.isLoaded(state.subject)) await window.AtlasQuestions.load(state.subject);
        populateSubjects(); $("#fSubject").value = state.subject;
      } catch (err) { console.error("题库加载失败", err); }
    }
    if (state.mode === "ability") {
      const sub = SUBJECTS.find(s => s.id === state.subject);
      askConfirm("能力测试 · 考试须知", `${sub ? sub.name : ""}能力测试从全题库按正式考试结构与难度梯度组卷，限时 180 分钟，倒计时结束自动交卷批改。交卷前不能查看解析与答案，查词、背题全部关闭；中途退出本次测试不保存成绩。确认开始吗？`, () => start());
      return;
    }
    if (state.mode === "exampaper") {
      const sel = $("#fPaper");
      const paperName = sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].textContent : "本套真题";
      askConfirm("真题模拟 · 考试须知", `${paperName}：整套真题限时 180 分钟，倒计时结束自动交卷。交卷前不能查看解析与答案，查词、背题、考点直达全部关闭；中途退出本次模拟不保存成绩。确认开始吗？`, () => start());
      return;
    }
    start();
  });
  $("#prev").addEventListener("click", () => go(session.i - 1));
  $("#next").addEventListener("click", () => go(session.i + 1));
  $("#reveal").addEventListener("click", () => { if (session.ended) { $("#exam").hidden = true; $("#result").hidden = false; renderResult(); } else showSolution(false); });
  $("#peekBtn").addEventListener("click", () => {
    if (!session || session.ended || session.mode !== "knowledge") return;
    session.peekMode = !session.peekMode;
    renderQuestion();
  });
  $("#submitBtn").addEventListener("click", requestSubmit);
  $("#sideSubmit").addEventListener("click", requestSubmit);
  $("#exitBtn").addEventListener("click", requestExit);
  $("#tocBtn").addEventListener("click", () => {
    const hidden = !$("#sheet").hidden;
    $("#sheet").hidden = hidden;
    $("#examGrid").classList.toggle("sheet-hidden", hidden);
    $("#tocBtn").textContent = hidden ? "目录" : "收起目录";
  });
  const hlBtns = $("#hintLevelBtns");
  if (hlBtns) hlBtns.addEventListener("click", e => {
    const b2 = e.target.closest("button[data-lv]"); if (!b2) return;
    hintLevelCur = b2.dataset.lv;
    if (window.EnglishWords && window.EnglishWords.setLevel) window.EnglishWords.setLevel(hintLevelCur);
    renderHintLevel();
    refreshPassageWords();
  });
  $("#qgrid").addEventListener("click", e => {
    const b = e.target.closest("[data-i]"); if (!b) return;
    go(Number(b.dataset.i));
    if (window.matchMedia("(max-width: 1000px)").matches && !$("#sheet").hidden) {
      $("#sheet").hidden = true;
      $("#examGrid").classList.add("sheet-hidden");
      $("#tocBtn").textContent = "目录";
    }
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
  $("#qtext").addEventListener("input", e => {
    if (e.target.classList && e.target.classList.contains("blank-in")) {
      const q = session ? current() : null;
      const before = q ? qAnswered(q) : false;
      syncBlanks();
      if (q) refreshSheetOnAnswerChange(q, before);
    }
  });
  $("#qtext").addEventListener("focusin", e => {
    if (e.target.classList && e.target.classList.contains("blank-in")) lastBlank = e.target;
  });
  $("#qtext").addEventListener("keydown", e => {
    if (!e.target.classList || !e.target.classList.contains("blank-in") || e.key !== "Enter") return;
    e.preventDefault();
    const list = currentBlanks();
    const i = list.indexOf(e.target);
    if (i >= 0 && i < list.length - 1) list[i + 1].focus(); else e.target.blur();
  });
  buildBlankTools();
  $("#gradebar").addEventListener("click", e => {
    const b = e.target.closest("[data-grade]"); if (b && !b.disabled) grade(b.dataset.grade);
  });
  $("#work").addEventListener("input", e => {
    if (!session) return;
    const q = current(); if (!q) return;
    const before = qAnswered(q);
    session.notes[q.id] = e.target.value;
    refreshSheetOnAnswerChange(q, before);
  });
  $("#aiAsk").addEventListener("click", () => { const q = current(); if (session.ended && ["english", "english2"].includes(q.subject) && /翻译|作文/.test(q.kind)) window.AtlasCoach.open({subject:q.subject, question:q, work:session.notes[q.id] || "", attemptId:session.attempt && session.attempt.id}); else aiGrade(false); });
  function choosePhoto(input) {
    if (!session || session.ended) return;
    input._target = { session, id: current().id };
    input.click();
  }
  $("#photoTake").addEventListener("click", () => choosePhoto($("#photoCamera")));
  $("#photoPick").addEventListener("click", () => choosePhoto($("#photoFile")));
  function notePhotos(msg) { const n = $("#photoNote"); if (n) n.textContent = msg; }
  async function onPhotoChange(e) {
    const input = e.target, target = input._target;
    const files = input.files ? [...input.files] : [];
    input.value = ""; input._target = null;
    if (!files.length || !target || session !== target.session || session.ended) return;
    const existing = await photoGet(target.id);
    const room = MAX_PHOTOS - existing.length;
    if (room <= 0) { notePhotos(`这道题已经有 ${MAX_PHOTOS} 张照片了，先删掉一页再添加。`); return; }
    const urls = [];
    for (const f of files.slice(0, room)) { const u = await fileToDataUrl(f); if (u) urls.push(u); }
    if (files.length > room) notePhotos(`每题最多 ${MAX_PHOTOS} 张照片，多出的没有添加。`);
    if (!urls.length || session !== target.session || session.ended) return;
    const next = existing.concat(urls);
    await photoPut(target.id, next);
    if (session === target.session && !session.ended && current().id === target.id) showPhotos(next);
    photoCount[target.id] = next.length;
    if (session === target.session && !session.ended) renderSheet();
  }
  $("#photoCamera").addEventListener("change", onPhotoChange);
  $("#photoFile").addEventListener("change", onPhotoChange);
  $("#photoThumbs").addEventListener("click", async e => {
    const b = e.target.closest("[data-del]"); if (!b || !session || session.ended) return;
    const q = current(); if (!q) return;
    const next = (await photoGet(q.id)).filter((_, i) => i !== Number(b.dataset.del));
    await photoPut(q.id, next);
    photoCount[q.id] = next.length;
    if (!session.ended) renderSheet();
    if (current() && current().id === q.id) showPhotos(next);
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
    $("#pintro").textContent = `共 ${publicCount("") + ITEMS.filter(i => i._bank === "private").length} 题：数学 ${publicCount("math")}、英语 ${publicCount("english")}、${window.ATLAS_CONTEST ? "" : `材力 ${publicCount("mechanics")}、`}政治 ${publicCount("politics")}。按知识点刷有答题卡目录；真题模拟选整套真题、能力测试按正式结构组卷，两种都是限时 180 分钟、到时自动交卷的抗压训练；按套卷刷为纯净全屏，套卷还附带 ${PAPERS.real.length} 套真题原卷${IS_GUEST ? "" : `与 ${PAPERS.mock.length} 套模拟卷`}。题库按科目分片加载，切换科目时自动补齐。`;
    populateSubjects();
    if (IS_GUEST) { // 游客没有个人题库与非真题来源，收起对应选项免得选了个空
      ["#fBank option[value='private']", "#fSource option[value='same']", "#fSource option[value='mock']"].forEach(sel => { const o = document.querySelector(sel); if (o) o.remove(); });
    }
    const params = new URLSearchParams(location.search);
    if (SUBJECTS.some(s => s.id === params.get("subject"))) state.subject = params.get("subject");
    $("#fSubject").value = state.subject; renderChapterOptions();
    if (params.get("chapter")) { state.chapter = params.get("chapter"); if (![...$("#fChapter").options].some(o => o.value === state.chapter)) $("#fChapter").add(new Option(state.chapter, state.chapter)); $("#fChapter").value = state.chapter; }
    state.kp = params.get("kp") || "";
    if ([...$("#fDiff").options].some(o => o.value === params.get("difficulty"))) { state.diff = params.get("difficulty"); $("#fDiff").value = state.diff; }
    updateCount();
    const wantModeRaw = params.get("mode");
    const wantMode = ["knowledge", "paper", "ability", "exampaper"].includes(wantModeRaw) ? wantModeRaw : wantModeRaw === "mock" ? "ability" : "knowledge";
    setMode(wantMode);
    if ((wantMode === "paper" || wantMode === "exampaper") && params.get("paper")) {
      const pv = params.get("paper");
      if ([...$("#fPaper").options].some(o => o.value === pv)) { state.paper = pv; $("#fPaper").value = pv; updateCount(); }
    }
    if (params.get("autostart") === "1") {
      /* App 直达：参数齐全时自动点开始（模考会先弹考试须知确认） */
      setTimeout(() => { const b = $("#pstart"); if (b && !b.disabled) b.click(); }, 80);
    }
  }

  async function bootstrap() {
    const bootUser = await window.AtlasUser.ready.catch(() => null); IS_GUEST = !bootUser; DB_NAME = window.AtlasUser.key("atlas-practice-photos");
    store = await window.AtlasUser.load("practice", {rec:{}}) || {rec:{}}; if (!store.rec) store.rec = {};
    try { const data = await window.AtlasUser.json("/api/personal/questions", "GET"); const mine = (data.items || []).map(q => ({...q, _bank:"private"}));
      mine.forEach(q => { if (q.subject && !SUBJECT_NAMES[q.subject]) { SUBJECT_NAMES[q.subject] = q.subjectName || q.subject; SUBJECTS.push({id:q.subject, name:SUBJECT_NAMES[q.subject], count:0}); } });
      ITEMS.push(...mine); } catch (err) { console.error("个人题库加载失败", err); }
    if (window.AtlasQuestions) {
      try {
        const p0 = new URLSearchParams(location.search);
        if (p0.get("review")) {
          /* 到期复盘只需到期错题涉及科目的分片（原先无条件全量加载约 15MB，进页先卡一轮）；
             到期列表取不到、或 loadForIds 内部判定需全量时回退 load("all")，题目集合不变。 */
          const dueIds = window.AtlasReview ? await window.AtlasReview.due().catch(() => null) : null;
          if (dueIds && window.AtlasQuestions.loadForIds) await window.AtlasQuestions.loadForIds(dueIds);
          else await window.AtlasQuestions.load("all");
        }
        else await window.AtlasQuestions.load(p0.get("subject") || "math");
        MANIFEST = await window.AtlasQuestions.manifest;
      } catch (err) { console.error("题库分片加载失败", err); }
    }
    init();
    /* 按需分片加载：切换科目时再按需拉取对应分片，避免首屏后台拉取 16MB 全量题库 */
    /* 错题本整本重练：?wrongbook=1 组「做错过的题 + 手动加入错题本的题」开练（支持 ?subject= 隔离） */
    if (new URLSearchParams(location.search).get("wrongbook")) {
      try {
        const wbSub = new URLSearchParams(location.search).get("subject");
        const store = await AtlasUser.load("practice", { rec: {} });
        const rec = (store && store.rec) || {};
        const marks = window.AtlasMarks ? await window.AtlasMarks.load() : { wb: {} };
        const wbSet = new Set(Object.keys(marks.wb || {}));
        const needIds = [...new Set([...Object.keys(rec).filter(id => rec[id] && rec[id].wrong > 0), ...wbSet])];
        if (window.AtlasQuestions && needIds.length) {
          if (wbSub && wbSub !== "all") await window.AtlasQuestions.load(wbSub);
          else if (window.AtlasQuestions.loadForIds) await window.AtlasQuestions.loadForIds(needIds);
        }
        const pool = ITEMS.filter(q => (!wbSub || wbSub === "all" || q.subject === wbSub) && ((rec[q.id] && rec[q.id].wrong > 0) || wbSet.has(q.id)));
        if (pool.length) start(pool, wbSub && wbSub !== "all" ? `错题本 · ${SUBJECT_NAMES[wbSub] || wbSub}` : "错题本 · 全部重练");
        else $("#pintro").textContent = "错题本还是空的：做错的题会自动进来，也可以在学情分析的做题详情里手动把题目加入错题本。";
      } catch (err) { console.error("错题本加载失败", err); }
    }
    /* 自组卷：资料库组卷中心经 localStorage 递交题目清单（?custom=1） */
    if (new URLSearchParams(location.search).get("custom")) {
      try {
        const paper = JSON.parse(localStorage.getItem("atlas.custompaper.v1") || "null");
        if (paper && Array.isArray(paper.items) && paper.items.length) {
          if (window.AtlasQuestions && paper.subject) { try { await window.AtlasQuestions.load(paper.subject); } catch (e) {} }
          const byId = {}; ITEMS.forEach(q => { byId[q.id] = q; });
          const pool = [];
          for (const it of paper.items) {
            const q = byId[it.id]; if (!q) continue;
            const c = { ...q };
            const sc = Number(it.score); if (Number.isFinite(sc) && sc > 0) c.maxScore = sc;
            pool.push(c);
          }
          if (pool.length) { state.subject = paper.subject || pool[0].subject; setMode("paper"); start(pool, paper.title || "自组卷"); }
          else $("#pintro").textContent = "自组卷的题目没能加载（可能已被删除），请回资料库重新组卷。";
        }
      } catch (err) { console.error("自组卷加载失败", err); }
    }
    /* 错题艾宾浩斯回流：?review=1 直接组今日到期错题开练；平时在设置区提示到期数量 */
    if (window.AtlasReview) {
      try {
        const dueIds = await window.AtlasReview.due();
        const link = $("#reviewLink");
        if (link && dueIds.length) { link.hidden = false; const b = $("#reviewDue"); if (b) b.textContent = `（${dueIds.length} 道到期）`; }
        if (new URLSearchParams(location.search).get("review")) {
          const dueSet = new Set(dueIds);
          const pool = ITEMS.filter(q => dueSet.has(q.id));
          if (pool.length) start(pool, "错题复习 · 艾宾浩斯回流");
          else $("#pintro").textContent = "今日没有到期的错题，状态很好。可以从下方选一种刷法继续推进。";
        }
      } catch (err) { console.error("错题复习加载失败", err); }
    }
  }
  bootstrap().catch(err => { $("#pintro").textContent = `加载失败：${err.message}`; $("#pstart").disabled = true; });
})();
