/* ============================================================
 * 英语阅读点词查义（蓝图 B1 · 英语专属模块，隔离原则：英语逻辑只进 english-* 文件）
 * 用途：把英语题目原文（passage）里的英文单词逐个包成可点击 span，
 *       点击弹出小浮层显示词表释义（assets/vocab-data.js，5529 词，懒加载）。
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
  var CSS_HREF = "assets/english-words.css?v=1";
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

  /* ---------------- 词表懒加载 ---------------- */
  var DICT = null, dictPromise = null;
  function buildDict() {
    DICT = {};
    var words = (window.VOCAB && window.VOCAB.words) || [];
    for (var i = 0; i < words.length; i++) {
      var e = words[i];
      if (e && e.w) DICT[String(e.w).toLowerCase()] = e;
    }
    return DICT;
  }
  function loadDict() {
    if (DICT) return Promise.resolve(DICT);
    if (window.VOCAB && window.VOCAB.words) return Promise.resolve(buildDict());
    if (!dictPromise) {
      dictPromise = new Promise(function (res, rej) {
        var sc = document.createElement("script");
        sc.src = VOCAB_SRC;
        sc.onload = res;
        sc.onerror = function () { rej(new Error("词典加载失败")); };
        document.head.appendChild(sc);
      }).then(function () { return buildDict(); });
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
    pop.querySelector(".ew-pop-ex").textContent = "";
    positionPop(span);
    syncStarBtn();
    var word = popWord;
    loadDict().then(function (dict) {
      if (!pop || pop.hidden || popWord !== word) return;
      var hit = lookup(word, dict);
      popHit = hit;
      var phon = pop.querySelector(".ew-pop-phon");
      var sub = pop.querySelector(".ew-pop-sub");
      var mean = pop.querySelector(".ew-pop-mean");
      var ex = pop.querySelector(".ew-pop-ex");
      if (hit) {
        var e = hit.entry;
        phon.textContent = e.p || e.phonetic || ""; // 当前词表无音标字段，有则显示
        var bits = [];
        if (hit.lemma !== word.toLowerCase()) bits.push("原形 " + hit.lemma);
        if (e.e) bits.push("等级 " + e.e);
        if (e.f) bits.push("真题出现 " + e.f + " 次");
        sub.textContent = bits.join(" · ");
        mean.textContent = e.m || "（暂无释义）";
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
    _test: { candidates: candidates, lookup: lookup, WORD_RE: WORD_RE }
  };
})();
