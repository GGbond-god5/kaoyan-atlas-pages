/* ============================================================
 * 英语阅读点词查义（蓝图 B1 · 英语专属模块，隔离原则：英语逻辑只进 english-* 文件）
 * 用途：把英语题目原文（passage）里的英文单词逐个包成可点击 span，
 *       点击弹出小浮层显示词典释义（懒加载两份数据合并）：
 *       assets/vocab-data.js（大纲 5529 词，等级/真题频次/例句以它为准）+
 *       assets/dict-data.js（ECDICT 开源英汉词典补全数据，MIT 许可，
 *       由 scripts/build-dict.mjs 生成：补音标、完整释义、英文释义、词形，
 *       并新增考研标注/真题出现/牛津核心标记/常见词条目）。
 *       查词顺序：规则词形还原 → ECDICT 变形映射 → 派生词剥离（词根词条）。
 * 接入：practice.js 仅在英语一/英语二题目渲染 passage 后调用 EnglishWords.enhance(el)。
 * 词形匹配顺序：原词小写 → 所有格/缩略处理 → 不规则表 → 复数/过去式/进行时/
 *       比较级最高级/副词等规则还原，逐个候选查词表，命中第一个为准。
 * 生词本：复用词汇页同一套机制——AtlasUser 的 "vocab" 状态里 star[小写词]=1，
 *       与 assets/vocab.js 的 toggleStar 完全一致（先 load 再改再 save，不覆盖既有记录）。
 * ============================================================ */
(function () {
  "use strict";
  if (window.EnglishWords) return;

  var VOCAB_SRC = "assets/vocab-data.js?v=2";
  var DICT_SRC = "assets/dict-data.js?v=1";
  var CSS_HREF = "assets/english-words.css?v=2";
  var WORD_RE = /[A-Za-z]+(?:['’][A-Za-z]+)?/g;

  /* ---------------- 纯函数：词形还原候选（无 DOM 依赖，可单测） ---------------- */
  var IRREGULAR = {
    went: "go", gone: "go", children: "child", men: "man", women: "woman",
    feet: "foot", teeth: "tooth", geese: "goose", mice: "mouse",
    was: "be", were: "be", is: "be", are: "be", am: "be", been: "be",
    has: "have", had: "have", does: "do", did: "do", done: "do",
    better: "good", best: "good", worse: "bad", worst: "bad",
    more: "much", most: "much", less: "little", least: "little",
    took: "take", taken: "take", saw: "see", seen: "see", thought: "think",
    brought: "bring", bought: "buy", found: "find", gave: "give", given: "give",
    told: "tell", became: "become", left: "leave", felt: "feel", kept: "keep",
    held: "hold", stood: "stand", understood: "understand", wrote: "write",
    written: "write", chose: "choose", chosen: "choose", drove: "drive",
    ate: "eat", eaten: "eat", fell: "fall", grew: "grow", grown: "grow",
    knew: "know", known: "know", threw: "throw", wore: "wear", worn: "wear",
    broke: "break", broken: "break", spoke: "speak", spoken: "speak",
    forgot: "forget", forgotten: "forget", began: "begin", begun: "begin",
    drank: "drink", sang: "sing", sat: "sit", won: "win", lost: "lose",
    paid: "pay", sent: "send", built: "build", spent: "spend", sold: "sell",
    taught: "teach", caught: "catch", drew: "draw", drawn: "draw",
    flew: "fly", flown: "fly", lay: "lie", lain: "lie", laid: "lay",
    meant: "mean", dealt: "deal", arose: "arise", bore: "bear", born: "bear",
    beat: "beat", bent: "bend", bled: "bleed", bred: "breed", burst: "burst",
    crept: "creep", fed: "feed", fled: "flee", forbade: "forbid",
    froze: "freeze", frozen: "freeze", hid: "hide", hidden: "hide",
    lent: "lend", lit: "light", rode: "ride", ridden: "ride", rang: "ring",
    rose: "rise", risen: "rise", sank: "sink", shook: "shake", shone: "shine",
    shot: "shoot", shrank: "shrink", slept: "sleep", slid: "slide",
    struck: "strike", swam: "swim", swore: "swear", swept: "sweep",
    swollen: "swell", tore: "tear", torn: "tear", woke: "wake", woken: "wake",
    withdrew: "withdraw", withdrawn: "withdraw", wrung: "wring"
  };
  var CONTRACTIONS = { "can't": "can", "won't": "will", "shan't": "shall" };

  function doubled(stem) { return /([bcdfghjklmnpqrstvwxz])\1$/.test(stem); }

  /* 生成候选原形（按优先级排序，去重） */
  function candidates(word) {
    var w = String(word == null ? "" : word).toLowerCase().replace(/’/g, "'").replace(/'+$/, "");
    var out = [];
    function push(x) { if (x && x.length > 1 && out.indexOf(x) < 0) out.push(x); }
    if (!w) return out;
    push(w);
    if (IRREGULAR[w]) push(IRREGULAR[w]);
    if (CONTRACTIONS[w]) push(CONTRACTIONS[w]);
    if (/'s$/.test(w)) push(w.slice(0, -2));                 // John's → John
    if (/n't$/.test(w)) push(w.slice(0, -3));                // don't → do(n't 去尾)
    if (/'(re|ve|ll|d|m)$/.test(w)) push(w.split("'")[0]);   // it's → it
    var stem;
    if (/ies$/.test(w) && w.length > 3) push(w.slice(0, -3) + "y");        // cities → city
    if (/(s|x|z|ch|sh)es$/.test(w)) push(w.slice(0, -2));                  // discusses → discuss
    if (/s$/.test(w) && !/ss$/.test(w)) push(w.slice(0, -1));              // walls → wall
    if (/ied$/.test(w) && w.length > 3) push(w.slice(0, -3) + "y");        // studied → study
    if (/ed$/.test(w)) {                                                   // discussed → discuss
      stem = w.slice(0, -2); push(stem); push(stem + "e");
      if (doubled(stem)) push(stem.slice(0, -1));                          // stopped → stop
    } else if (/d$/.test(w) && w.length > 2) push(w.slice(0, -1));         // used → use
    if (/ying$/.test(w)) push(w.slice(0, -4) + "ie");                      // lying → lie
    if (/ing$/.test(w)) {                                                  // making → make / running → run
      stem = w.slice(0, -3); push(stem); push(stem + "e");
      if (doubled(stem)) push(stem.slice(0, -1));
    }
    if (/iest$/.test(w)) push(w.slice(0, -4) + "y");                       // happiest → happy
    if (/ier$/.test(w)) push(w.slice(0, -3) + "y");                        // happier → happy
    if (/est$/.test(w)) {                                                  // biggest → big
      stem = w.slice(0, -3); push(stem); push(stem + "e");
      if (doubled(stem)) push(stem.slice(0, -1));
    }
    if (/er$/.test(w) && w.length > 3) {                                   // bigger → big / larger → large
      stem = w.slice(0, -2); push(stem); push(stem + "e");
      if (doubled(stem)) push(stem.slice(0, -1));
    }
    if (/ily$/.test(w)) push(w.slice(0, -3) + "y");                        // happily → happy
    else if (/ly$/.test(w) && w.length > 3) push(w.slice(0, -2));          // quickly → quick
    return out;
  }

  /* 在词表索引（小写词 → 词条）里查词，返回 {lemma, entry} 或 null */
  function lookup(word, dict) {
    if (!dict) return null;
    var cs = candidates(word);
    for (var i = 0; i < cs.length; i++) {
      if (dict[cs[i]]) return { lemma: cs[i], entry: dict[cs[i]] };
    }
    return null;
  }

  /* 派生词剥离候选（纯函数）：直查与规则还原都落空时才回退到词根，
   * 只处理 -ically/-ical/-tion/-ness/-ity 等派生后缀，不影响已命中路径。 */
  function deriveRoots(word) {
    var w = String(word == null ? "" : word).toLowerCase();
    var out = [];
    function push(x) { if (x && x.length > 2 && out.indexOf(x) < 0) out.push(x); }
    if (/ically$/.test(w) && w.length > 7) { push(w.slice(0, -6) + "ic"); push(w.slice(0, -6) + "y"); }
    if (/ical$/.test(w) && w.length > 6) { push(w.slice(0, -4) + "ic"); push(w.slice(0, -4) + "y"); }
    if (/iness$/.test(w) && w.length > 6) push(w.slice(0, -5) + "y");
    else if (/ness$/.test(w) && w.length > 6) push(w.slice(0, -4));
    if (/bility$/.test(w) && w.length > 7) push(w.slice(0, -6) + "ble");
    else if (/ity$/.test(w) && w.length > 5) { push(w.slice(0, -3) + "ive"); push(w.slice(0, -3)); }
    if (/ization$/.test(w) && w.length > 9) { push(w.slice(0, -7) + "ize"); push(w.slice(0, -7)); }
    if (/isation$/.test(w) && w.length > 9) { push(w.slice(0, -7) + "ise"); push(w.slice(0, -7)); }
    if (/tion$/.test(w) && w.length > 6) { push(w.slice(0, -3)); push(w.slice(0, -3) + "e"); }
    else if (/sion$/.test(w) && w.length > 6) { push(w.slice(0, -3)); push(w.slice(0, -4) + "e"); }
    return out;
  }

  /* 完整查词：规则还原（lookup）→ ECDICT 变形映射（forms）→ 派生剥离（root 标记）。
   * 例外：ECDICT 把部分变形词也立了薄词条（如 went/studies），这类词典独有词条
   * 若排在原形前面会遮蔽原形——命中 dictOnly 词条时先让位于候选链上的原形，
   * 保持原有「点变形词显示原形词条」的行为；大纲词条不受此影响。 */
  function lookupFull(word, dict, forms) {
    if (!dict) return null;
    var w = String(word == null ? "" : word).toLowerCase().replace(/’/g, "'").replace(/'+$/, "");
    var self = dict[w];
    if (self && self.dictOnly) {
      var cs0 = candidates(word);
      for (var j = 1; j < cs0.length; j++) {
        if (dict[cs0[j]]) return { lemma: cs0[j], entry: dict[cs0[j]] };
      }
      if (forms && forms[w] && dict[forms[w]]) return { lemma: forms[w], entry: dict[forms[w]], viaForm: w };
      return { lemma: w, entry: self };
    }
    var hit = lookup(word, dict);
    if (hit) return hit;
    var i, lemma;
    if (forms) {
      var cs = candidates(word);
      for (i = 0; i < cs.length; i++) {
        lemma = forms[cs[i]];
        if (lemma && dict[lemma]) return { lemma: lemma, entry: dict[lemma], viaForm: cs[i] };
      }
    }
    var roots = deriveRoots(word);
    for (i = 0; i < roots.length; i++) {
      hit = lookup(roots[i], dict);
      if (hit) { hit.root = true; return hit; }
      if (forms && forms[roots[i]] && dict[forms[roots[i]]]) {
        return { lemma: forms[roots[i]], entry: dict[forms[roots[i]]], root: true };
      }
    }
    return null;
  }

  /* 词形 exchange 字符串 → 可读文本，如「词形：过去式 went · 过去分词 gone」 */
  var FORM_LABELS = { p: "过去式", d: "过去分词", i: "现在分词", "3": "三单", s: "复数", r: "比较级", t: "最高级" };
  function formsText(x) {
    if (!x) return "";
    var parts = [];
    String(x).split("/").forEach(function (seg) {
      var i = seg.indexOf(":");
      if (i <= 0) return;
      var k = seg.slice(0, i), v = seg.slice(i + 1);
      if (FORM_LABELS[k] && v) parts.push(FORM_LABELS[k] + " " + v);
    });
    return parts.length ? "词形：" + parts.join(" · ") : "";
  }

  /* ---------------- 词典懒加载与合并 ----------------
   * 合并口径（纯函数，可单测）：大纲词条为骨架，等级 e、真题频次 f、例句 ex 以
   * vocab-data 为准、不覆盖；dict-data 只补音标 p、完整释义 dm、英文释义 en、
   * 词形 x，并新增词典独有词条（带真题频次 f 与考试等级标注 tag）。 */
  function mergeDicts(vocabWords, dictdb) {
    var dict = {};
    var words = vocabWords || [];
    for (var i = 0; i < words.length; i++) {
      var e = words[i];
      if (e && e.w) dict[String(e.w).toLowerCase()] = e;
    }
    var sup = (dictdb && dictdb.w) || {};
    Object.keys(sup).forEach(function (key) {
      var a = sup[key] || [];
      var phon = a[0] || "", dm = a[1] || "", en = a[2] || "", x = a[3] || "";
      if (/^see\b/i.test(en)) en = ""; // ECDICT 个别英文释义只是互见条目，无信息量
      var cur = dict[key];
      if (cur) {
        if (phon && !cur.p) cur.p = phon;
        if (dm && !cur.dm) cur.dm = dm;
        if (en && !cur.en) cur.en = en;
        if (x && !cur.x) cur.x = x;
      } else {
        dict[key] = { w: key, m: dm, p: phon, en: en, x: x, f: a[4] || 0, e: "", tag: a[5] || "", dictOnly: 1 };
      }
    });
    return { dict: dict, forms: (dictdb && dictdb.f) || {} };
  }

  var DICT = null, FORMS = {}, dictPromise = null;
  function buildDict() {
    var merged = mergeDicts((window.VOCAB && window.VOCAB.words) || [], window.DICTDB);
    DICT = merged.dict;
    FORMS = merged.forms || {};
    return DICT;
  }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var sc = document.createElement("script");
      sc.src = src;
      sc.onload = res;
      sc.onerror = function () { rej(new Error("词典加载失败")); };
      document.head.appendChild(sc);
    });
  }
  function loadDict() {
    if (DICT) return Promise.resolve(DICT);
    if (window.VOCAB && window.VOCAB.words && window.DICTDB) return Promise.resolve(buildDict());
    if (!dictPromise) {
      var jobs = [];
      if (!(window.VOCAB && window.VOCAB.words)) jobs.push(loadScript(VOCAB_SRC));
      // 补全词典加载失败时退化为只用大纲词表，不让整个查词不可用
      if (!window.DICTDB) jobs.push(loadScript(DICT_SRC).catch(function () { }));
      dictPromise = Promise.all(jobs).then(function () { return buildDict(); });
    }
    return dictPromise;
  }

  /* ---------------- 生词本（复用 vocab 状态的 star 机制） ---------------- */
  var STAR_FALLBACK = { rec: {}, star: {}, days: {}, tts: true };
  var vocabState = null, statePromise = null;
  function ensureVocabState() {
    if (vocabState) return Promise.resolve(vocabState);
    if (!window.AtlasUser || !window.AtlasUser.load || !window.AtlasUser.save) return Promise.resolve(null);
    if (!statePromise) {
      statePromise = window.AtlasUser.load("vocab", STAR_FALLBACK).then(function (s) {
        vocabState = Object.assign({}, STAR_FALLBACK, s || {});
        vocabState.star = vocabState.star || {};
        return vocabState;
      }).catch(function () { return null; });
    }
    return statePromise;
  }
  function starKeyFor(word, hit) { return hit ? hit.lemma : String(word).toLowerCase(); }
  function toggleStar(key) {
    return ensureVocabState().then(function (st) {
      if (!st) return null;
      var on;
      if (st.star[key]) { delete st.star[key]; on = false; } else { st.star[key] = 1; on = true; }
      return window.AtlasUser.save("vocab", st).then(function () { return on; }).catch(function () { return null; });
    });
  }

  /* ---------------- DOM：单词包裹 ---------------- */
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, BUTTON: 1, SELECT: 1 };
  function skippable(node, container) {
    var p = node.parentNode;
    while (p && p !== container) {
      if (p.nodeType === 1) {
        if (SKIP_TAGS[p.tagName]) return true;
        if (p.classList && (p.classList.contains("cloze-blank") || p.classList.contains("katex") || p.classList.contains("ew-word"))) return true;
      }
      p = p.parentNode;
    }
    return false;
  }
  function wrapTextNode(node) {
    var text = node.nodeValue;
    var re = new RegExp(WORD_RE.source, "g");
    var frag = document.createDocumentFragment();
    var last = 0, m, changed = false;
    while ((m = re.exec(text))) {
      changed = true;
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var sp = document.createElement("span");
      sp.className = "ew-word";
      sp.textContent = m[0];
      sp.setAttribute("data-w", m[0]);
      sp.setAttribute("tabindex", "0");
      sp.setAttribute("role", "button");
      sp.setAttribute("aria-label", "查看释义：" + m[0]);
      frag.appendChild(sp);
      last = m.index + m[0].length;
    }
    if (!changed) return;
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }
  function enhance(container) {
    if (!container || !document.createTreeWalker) return;
    if (container.querySelector(".ew-word")) return; // 已处理过，避免重复包裹
    ensureCss();
    loadDict().catch(function () { /* 词典失败不影响包裹，点击时再提示 */ });
    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue || !/[A-Za-z]/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        return skippable(node, container) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (var i = 0; i < nodes.length; i++) wrapTextNode(nodes[i]);
  }

  /* ---------------- 浮层 ---------------- */
  var pop = null, popSpan = null, popWord = "", popHit = null;
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function ensureCss() {
    if (document.querySelector('link[href^="assets/english-words.css"]')) return;
    var lk = document.createElement("link");
    lk.rel = "stylesheet";
    lk.href = CSS_HREF;
    document.head.appendChild(lk);
  }
  function ensurePop() {
    if (pop) return pop;
    ensureCss();
    pop = document.createElement("div");
    pop.className = "ew-pop";
    pop.hidden = true;
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "单词释义");
    pop.innerHTML =
      '<button type="button" class="ew-pop-x" aria-label="关闭">×</button>' +
      '<div class="ew-pop-head"><span class="ew-pop-word"></span><span class="ew-pop-phon"></span></div>' +
      '<div class="ew-pop-sub"></div>' +
      '<div class="ew-pop-mean"></div>' +
      '<div class="ew-pop-en"></div>' +
      '<div class="ew-pop-forms"></div>' +
      '<div class="ew-pop-ex"></div>' +
      '<button type="button" class="ew-pop-star">☆ 加入生词本</button>';
    document.body.appendChild(pop);
    pop.querySelector(".ew-pop-x").addEventListener("click", closePop);
    pop.querySelector(".ew-pop-star").addEventListener("click", onStarClick);
    return pop;
  }
  function positionPop(span) {
    var r = span.getBoundingClientRect();
    var w = Math.min(320, window.innerWidth - 16);
    pop.style.width = w + "px";
    var left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    pop.style.left = left + "px";
    pop.style.top = "0px";
    pop.hidden = false;
    var h = pop.offsetHeight || 140;
    var top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    pop.style.top = top + "px";
  }
  function syncStarBtn() {
    if (!pop) return;
    var btn = pop.querySelector(".ew-pop-star");
    var key = starKeyFor(popWord, popHit);
    ensureVocabState().then(function (st) {
      if (!pop || pop.hidden || starKeyFor(popWord, popHit) !== key) return;
      var on = !!(st && st.star && st.star[key]);
      btn.textContent = on ? "★ 已在生词本" : "☆ 加入生词本";
      btn.classList.toggle("on", on);
      btn.disabled = !st;
      if (!st) btn.textContent = "☆ 加入生词本（需登录同步）";
    });
  }
  function onStarClick() {
    var key = starKeyFor(popWord, popHit);
    var btn = pop.querySelector(".ew-pop-star");
    btn.disabled = true;
    toggleStar(key).then(function (on) {
      btn.disabled = false;
      if (on === null) { btn.textContent = "同步失败，请重试"; return; }
      btn.textContent = on ? "★ 已在生词本" : "☆ 加入生词本";
      btn.classList.toggle("on", on);
    });
  }
  function openPop(span) {
    ensurePop();
    popSpan = span;
    popWord = span.getAttribute("data-w") || span.textContent || "";
    popHit = null;
    pop.querySelector(".ew-pop-word").textContent = popWord;
    pop.querySelector(".ew-pop-phon").textContent = "";
    pop.querySelector(".ew-pop-sub").textContent = "";
    pop.querySelector(".ew-pop-mean").textContent = "查词中…";
    pop.querySelector(".ew-pop-en").textContent = "";
    pop.querySelector(".ew-pop-forms").textContent = "";
    pop.querySelector(".ew-pop-ex").textContent = "";
    positionPop(span);
    syncStarBtn();
    var word = popWord;
    loadDict().then(function (dict) {
      if (!pop || pop.hidden || popWord !== word) return;
      var hit = lookupFull(word, dict, FORMS);
      popHit = hit;
      var phon = pop.querySelector(".ew-pop-phon");
      var sub = pop.querySelector(".ew-pop-sub");
      var mean = pop.querySelector(".ew-pop-mean");
      var enEl = pop.querySelector(".ew-pop-en");
      var formsEl = pop.querySelector(".ew-pop-forms");
      var ex = pop.querySelector(".ew-pop-ex");
      if (hit) {
        var e = hit.entry;
        phon.textContent = e.p ? "/" + e.p + "/" : "";
        var bits = [];
        if (hit.root) bits.push("词根词条");
        if (hit.lemma !== word.toLowerCase()) bits.push("原形 " + hit.lemma);
        if (e.e) bits.push("等级 " + e.e);
        if (e.tag) bits.push(e.tag);
        if (e.f) bits.push("真题出现 " + e.f + " 次");
        sub.textContent = bits.join(" · ");
        // 释义：ECDICT 完整释义比大纲简释更长时用完整版，否则用大纲简释
        var full = e.dm || "";
        mean.textContent = (full && full.length > String(e.m || "").length) ? full : (e.m || full || "（暂无释义）");
        enEl.textContent = e.en || "";
        formsEl.textContent = formsText(e.x);
        ex.textContent = e.ex ? ("例句：" + e.ex + (e.exCn ? "（" + e.exCn + "）" : "")) : "";
      } else {
        sub.textContent = "";
        mean.textContent = "词表未收录这个词，可以先收进生词本，之后在词汇页统一处理。";
        ex.textContent = "";
      }
      positionPop(span);
      syncStarBtn();
    }).catch(function () {
      if (!pop || pop.hidden || popWord !== word) return;
      pop.querySelector(".ew-pop-mean").textContent = "词典加载失败，请检查网络后重试。";
    });
  }
  function closePop() {
    if (pop) pop.hidden = true;
    popSpan = null;
  }

  /* ---------------- 全局事件（只注册一次） ---------------- */
  document.addEventListener("click", function (e) {
    var t = e.target;
    var span = t && t.closest ? t.closest(".ew-word") : null;
    if (span) { openPop(span); return; }
    if (pop && !pop.hidden && !(t && t.closest && t.closest(".ew-pop"))) closePop();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closePop(); return; }
    var t = e.target;
    if ((e.key === "Enter" || e.key === " ") && t && t.classList && t.classList.contains("ew-word")) {
      e.preventDefault();
      openPop(t);
    }
  });

  window.EnglishWords = {
    enhance: enhance,
    close: closePop,
    _test: {
      candidates: candidates, lookup: lookup, lookupFull: lookupFull,
      deriveRoots: deriveRoots, mergeDicts: mergeDicts, formsText: formsText,
      WORD_RE: WORD_RE
    }
  };
})();
