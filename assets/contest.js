/* 参赛版（Qoder 高校创造力大赛）前端适配：仅在 --contest 构建里加载（window.ATLAS_CONTEST）。
 * 作用：隐藏纯后端入口、给游客标识、在测试页与首页提供「AI 批改样例」入口。
 * 正式版不加载本文件，站点行为不受影响。 */
(function () {
  'use strict';
  /* 参赛版跳过新手引导：onboarding 自动弹出先读 AtlasUser 的 onboarding 状态，
     这里直接返回已完成（localStorage 预置只对读取失败的兜底路径有效，单靠它不够）。 */
  if (window.AtlasUser && AtlasUser.load) {
    var origLoad = AtlasUser.load.bind(AtlasUser);
    AtlasUser.load = function (ns, def) {
      if (ns === 'onboarding') return Promise.resolve({ done: true });
      return origLoad(ns, def);
    };
  }

  "use strict";
  if (!window.ATLAS_CONTEST) return;

  var HIDE_HREFS = ["community.html", "library.html", "admin.html", "login.html", "register.html", "analytics.html"];

  function cleanup() {
    document.querySelectorAll("a[href]").forEach(function (a) {
      var h = a.getAttribute("href") || "";
      for (var i = 0; i < HIDE_HREFS.length; i++) {
        var x = HIDE_HREFS[i];
        if (h === x || h.indexOf(x + "?") === 0 || h.indexOf(x + "#") === 0) { a.style.display = "none"; break; }
      }
    });
    ["hubSettingsBtn", "hubAdmin"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
    document.querySelectorAll(".hub-panel button").forEach(function (b) {
      if (/登录|注册/.test(b.textContent || "")) b.style.display = "none";
    });
  }

  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function dimsHtml(dims) {
    return (dims || []).map(function (d) {
      var pct = d.max > 0 ? Math.round(100 * d.score / d.max) : 0;
      return '<div class="cs-dim"><span class="cs-dim-name">' + esc(d.name) + '</span>' +
        '<span class="cs-dim-bar"><i style="width:' + pct + '%"></i></span>' +
        '<span class="cs-dim-score">' + esc(d.score) + "/" + esc(d.max) + '</span>' +
        '<span class="cs-dim-comment">' + esc(d.comment) + "</span></div>";
    }).join("");
  }

  function sampleCard(key, s) {
    var html = '<section class="cs-card"><h3>' + esc(s.title) +
      '<span class="cs-score">' + esc(s.score) + " / " + esc(s.maxScore) + " 分</span></h3>" +
      '<p class="cs-q"><b>题目</b>' + esc(s.question) + "</p>" +
      '<p class="cs-q"><b>作答</b>' + esc(s.answer) + "</p>" +
      '<div class="cs-dims">' + dimsHtml(s.dimensions) + "</div>" +
      '<ul class="cs-comments">' + (s.comments || []).map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul>";
    if (key === "essay") {
      html += '<h4>语法纠错</h4><ul class="cs-list">' + (s.grammar || []).map(function (g) {
        return "<li><s>" + esc(g.wrong) + "</s> → <b>" + esc(g.right) + "</b><span>" + esc(g.note) + "</span></li>";
      }).join("") + "</ul>" +
      '<h4>句式升级</h4><ul class="cs-list">' + (s.upgrades || []).map(function (u) {
        return "<li>" + esc(u.from) + " → <b>" + esc(u.to) + "</b></li>";
      }).join("") + "</ul>" +
      '<h4>改写范文</h4><p class="cs-revised">' + esc(s.revised) + "</p>";
    }
    return html + "</section>";
  }

  function openSample() {
    if (document.getElementById("csOverlay")) return;
    var data = window.CONTEST_SAMPLE || {};
    var ov = document.createElement("div");
    ov.id = "csOverlay";
    ov.innerHTML =
      '<div class="cs-box"><div class="cs-head"><b>AI 批改样例</b>' +
      '<span>正式版拍照上传后由 AI 按考研改卷规范逐步给分：分维度评价 + 逐句依据</span>' +
      '<button type="button" class="cs-close" aria-label="关闭">×</button></div>' +
      (data.placeholder ? '<p class="cs-note">样例数据接入中：此处将替换为正式版的真实批改结果（数学解答题 + 英语大作文）。</p>' : "") +
      sampleCard("math", data.math || {}) + sampleCard("essay", data.essay || {}) +
      "</div>";
    document.body.appendChild(ov);
    ov.querySelector(".cs-close").addEventListener("click", function () { ov.remove(); });
    ov.addEventListener("click", function (e) { if (e.target === ov) ov.remove(); });
  }

  function addStyle() {
    var st = document.createElement("style");
    st.textContent =
      ".cs-pill{position:fixed;left:14px;bottom:14px;z-index:60;background:#1F3A5F;color:#F7F2E8;border:0;border-radius:999px;padding:8px 14px;font-size:12px;cursor:pointer;box-shadow:0 4px 16px rgba(31,58,95,.35)}" +
      ".cs-pill:hover{background:#A53B30}" +
      "#csOverlay{position:fixed;inset:0;z-index:200;background:rgba(24,32,44,.55);overflow:auto;padding:24px 12px}" +
      ".cs-box{max-width:860px;margin:0 auto;background:#F7F2E8;border-radius:10px;padding:20px 22px;color:#223}" +
      ".cs-head{display:flex;align-items:baseline;gap:12px;border-bottom:2px solid #1F3A5F;padding-bottom:10px}" +
      ".cs-head b{font-size:19px;color:#1F3A5F}.cs-head span{font-size:12px;color:#66707c;flex:1}" +
      ".cs-close{border:0;background:none;font-size:24px;cursor:pointer;color:#1F3A5F;line-height:1}" +
      ".cs-note{background:#FFF3D6;border:1px solid #E3C878;border-radius:6px;padding:8px 12px;font-size:13px}" +
      ".cs-card{background:#fff;border:1px solid #E2DCCB;border-radius:8px;padding:14px 16px;margin-top:14px}" +
      ".cs-card h3{margin:0 0 8px;font-size:16px;color:#1F3A5F;display:flex;justify-content:space-between}" +
      ".cs-score{color:#A53B30;font-weight:700}" +
      ".cs-q{font-size:13px;line-height:1.7;margin:6px 0}.cs-q b{color:#1F3A5F;margin-right:8px}" +
      ".cs-dim{display:flex;align-items:center;gap:8px;font-size:12px;margin:4px 0;flex-wrap:wrap}" +
      ".cs-dim-name{width:64px;color:#1F3A5F;font-weight:600}" +
      ".cs-dim-bar{width:130px;height:8px;background:#EAE4D2;border-radius:4px;overflow:hidden}" +
      ".cs-dim-bar i{display:block;height:100%;background:#1F3A5F}" +
      ".cs-dim-score{width:52px;color:#A53B30;font-weight:600}" +
      ".cs-dim-comment{color:#66707c;flex:1;min-width:180px}" +
      ".cs-comments{font-size:13px;line-height:1.8;margin:8px 0 0;padding-left:18px}" +
      ".cs-card h4{margin:12px 0 4px;font-size:13px;color:#1F3A5F}" +
      ".cs-list{font-size:13px;line-height:1.8;margin:0;padding-left:18px}.cs-list span{color:#66707c;margin-left:8px}" +
      ".cs-revised{font-size:13px;line-height:1.9;background:#FBF8EF;border-radius:6px;padding:10px 12px;margin:0}" +
      ".cs-sample-btn{margin:10px 0 0;background:#A53B30;color:#fff;border:0;border-radius:6px;padding:9px 16px;font-size:13px;cursor:pointer}";
    document.head.appendChild(st);
  }

  document.addEventListener("DOMContentLoaded", function () {
    addStyle();
    cleanup();
    setTimeout(cleanup, 900); // 头像菜单等异步渲染后再清一次

    var pill = document.createElement("button");
    pill.type = "button";
    pill.className = "cs-pill";
    pill.textContent = "参赛演示版 · 游客模式 — 看 AI 批改样例";
    pill.addEventListener("click", openSample);
    document.body.appendChild(pill);

    if (/practice\.html/.test(location.pathname)) {
      var tabs = document.getElementById("modeTabs");
      if (tabs) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cs-sample-btn";
        btn.textContent = "AI 批改样例（参赛演示）";
        btn.addEventListener("click", openSample);
        tabs.parentNode.insertBefore(btn, tabs.nextSibling);
      }
      if (/[?&]sample=1/.test(location.search)) setTimeout(openSample, 400);
    }
  });
})();
