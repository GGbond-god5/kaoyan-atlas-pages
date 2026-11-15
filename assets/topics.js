/* 知识点选题：科目 → 章节 → 知识点，点知识点直接进刷题页（knowledge 模式预选）。 */
(function () {
  "use strict";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var SUBJECT_NAMES = { math: "数学一", math2: "数学二", english: "英语一", english2: "英语二", mechanics: "807 材料力学", politics: "政治" };
  var TOPIC_NAMES = {
    "pol-01": "马克思主义基本原理（哲学）", "pol-02": "马克思主义政治经济学与科学社会主义",
    "pol-03": "毛泽东思想和中国特色社会主义理论体系", "pol-04": "习近平新时代中国特色社会主义思想",
    "pol-05": "中国近现代史纲要", "pol-06": "思想道德与法治", "pol-07": "形势与政策及当代世界经济与政治",
    "english-01": "词汇与长难句", "english-02": "完形填空", "english-03": "阅读理解 Part A",
    "english-04": "新题型 Part B", "english-05": "翻译 Part C", "english-06": "小作文",
    "english-07": "大作文", "english-08": "作文句式分类库",
  };
  var ITEMS = (window.QUESTIONS || []).slice();
  var rec = {};
  var activeSubject = "all";
  var query = "";

  var topicOf = function (i) { return i.topicChapter || i.chapter; };
  var topicNameOf = function (i) { return TOPIC_NAMES[i.topicChapter] || i.topicTitle || i.chapterTitle || topicOf(i) || "未分类"; };
  function isPaperChapter(id) {
    var list = ITEMS.filter(function (i) { return i.chapter === id; });
    return list.length > 0 && list.every(function (i) { return !i.kp && /第\d+题/.test(i.kpName || ""); });
  }
  var inTopicMode = function (i) { return i._bank === "private" || !isPaperChapter(i.chapter) || !!i.topicChapter; };

  function subjectName(id) {
    if (SUBJECT_NAMES[id]) return SUBJECT_NAMES[id];
    var it = ITEMS.find(function (i) { return i.subject === id && i.subjectName; });
    return (it && it.subjectName) || id;
  }

  function buildTree() {
    var subjects = new Map();
    ITEMS.filter(inTopicMode).forEach(function (i) {
      var sid = i.subject || "other";
      if (!subjects.has(sid)) subjects.set(sid, { id: sid, name: subjectName(sid), chapters: new Map(), total: 0 });
      var sub = subjects.get(sid);
      var ch = topicOf(i) || "未分类";
      if (!sub.chapters.has(ch)) sub.chapters.set(ch, { id: ch, name: topicNameOf(i), kps: new Map(), loose: [] });
      var chapter = sub.chapters.get(ch);
      sub.total += 1;
      if (i.kp) {
        if (!chapter.kps.has(i.kp)) chapter.kps.set(i.kp, { id: i.kp, name: i.kpName || i.kp, items: [] });
        chapter.kps.get(i.kp).items.push(i);
      } else {
        chapter.loose.push(i);
      }
    });
    return subjects;
  }

  function stats(items) {
    var seen = 0, ok = 0, judged = 0;
    items.forEach(function (i) {
      var r = rec[i.id];
      if (r && r.seen) { seen += 1; ok += r.ok || 0; judged += (r.ok || 0) + (r.wrong || 0); }
    });
    return { total: items.length, seen: seen, rate: judged ? Math.round(100 * ok / judged) : null };
  }

  function practiceUrl(sid, ch, kp) {
    var p = new URLSearchParams();
    if (sid && sid !== "all") p.set("subject", sid);
    if (ch) p.set("chapter", ch);
    if (kp) p.set("kp", kp);
    var qs = p.toString();
    return "practice.html" + (qs ? "?" + qs : "");
  }

  function render() {
    var subjects = buildTree();
    var tabs = document.getElementById("ktabs");
    var order = Object.keys(SUBJECT_NAMES).filter(function (id) { return subjects.has(id); })
      .concat(Array.from(subjects.keys()).filter(function (id) { return !SUBJECT_NAMES[id]; }));
    tabs.innerHTML = '<button type="button" data-s="all" class="' + (activeSubject === "all" ? "on" : "") + '">全部科目</button>' +
      order.map(function (id) {
        var s = subjects.get(id);
        return '<button type="button" data-s="' + esc(id) + '" class="' + (activeSubject === id ? "on" : "") + '">' + esc(s.name) + "（" + s.total + "）</button>";
      }).join("");
    tabs.querySelectorAll("button").forEach(function (b) {
      b.onclick = function () { activeSubject = b.dataset.s; render(); };
    });

    var box = document.getElementById("klist");
    var html = "";
    order.forEach(function (sid) {
      if (activeSubject !== "all" && activeSubject !== sid) return;
      var s = subjects.get(sid);
      html += '<section class="ksubject"><h2>' + esc(s.name) + '<span>' + s.total + ' 题</span></h2>';
      s.chapters.forEach(function (chapter) {
        var cards = "";
        chapter.kps.forEach(function (kp) {
          if (query && kp.name.indexOf(query) < 0) return;
          var st = stats(kp.items);
          var pct = st.total ? Math.round(100 * st.seen / st.total) : 0;
          cards += '<a class="kcard" href="' + practiceUrl(sid, chapter.id, kp.id) + '">' +
            '<b>' + esc(kp.name) + '</b>' +
            '<span class="kmeta">' + st.total + ' 题 · 已练 ' + st.seen + (st.rate != null ? ' · 正确率 ' + st.rate + '%' : '') + '</span>' +
            '<span class="kbar"><i style="width:' + pct + '%"></i></span></a>';
        });
        if (chapter.loose.length) {
          var names = {};
          chapter.loose.forEach(function (i) { if (i.kpName) names[i.kpName] = 1; });
          var label = Object.keys(names).length === 1 ? Object.keys(names)[0] : "本章其他题目";
          if (!query || label.indexOf(query) >= 0) {
            var st2 = stats(chapter.loose);
            var pct2 = st2.total ? Math.round(100 * st2.seen / st2.total) : 0;
            cards += '<a class="kcard loose" href="' + practiceUrl(sid, chapter.id, "") + '">' +
              '<b>' + esc(label) + '</b>' +
              '<span class="kmeta">' + st2.total + ' 题 · 已练 ' + st2.seen + (st2.rate != null ? ' · 正确率 ' + st2.rate + '%' : '') + '</span>' +
              '<span class="kbar"><i style="width:' + pct2 + '%"></i></span></a>';
          }
        }
        if (!cards) return;
        html += '<div class="kchapter"><div class="kch-head"><h3>' + esc(chapter.name) + '</h3>' +
          '<a href="' + practiceUrl(sid, chapter.id, "") + '">练整章 →</a></div><div class="kgrid">' + cards + "</div></div>";
      });
      html += "</section>";
    });
    box.innerHTML = html || '<p class="kloading">没有匹配的知识点。</p>';
  }

  document.getElementById("ksearch").addEventListener("input", function (e) { query = e.target.value.trim(); render(); });

  (async function boot() {
    try {
      await window.AtlasUser.ready;
      var data = await window.AtlasUser.json("/api/personal/questions");
      (data.items || []).forEach(function (q) { q._bank = "private"; ITEMS.push(q); });
    } catch (e) { /* 个人题库拉取失败不阻塞公共题库 */ }
    try {
      var st = await window.AtlasUser.load("practice");
      rec = (st && st.rec) || {};
    } catch (e) { /* ignore */ }
    render();
  })();
})();
