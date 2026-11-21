/* 账号中心：顶栏头像入口（与账号绑定，全站统一）。
 * 未登录显示「登录」；已登录显示头像，点击弹出个人中心面板：
 * 名片（头像/昵称/格言/目标/倒计时）+ 编辑档案 + 社区分享 + 账号设置（改密码/导出/注销）+ 退出登录。 */
(function () {
  "use strict";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var QUOTES = ["山海可平，功不唐捐。", "日拱一卒，功不唐捐。", "把题做对，把心放稳。", "错题是地图，不是判决。", "今天多算一遍，明天少慌一分。", "上岸不是奇迹，是重复。"];
  var me = null, profile = null, panel = null, btn = null, adminChecked = false;

  function api(path, method, body) {
    return fetch(path, {
      method: method || "GET", credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || d.ok === false) throw new Error(d.error || ("HTTP " + r.status));
        return d;
      });
    });
  }

  function avatarSrc() { return profile && profile.avatarAt ? "/api/profile/avatar?v=" + profile.avatarAt : ""; }
  function initial() { return esc((me && me.nickname ? me.nickname.trim().charAt(0) : "") || "观"); }

  function paintButton() {
    if (!btn) return;
    var src = avatarSrc();
    btn.innerHTML = src
      ? '<img src="' + src + '" alt="我的头像">'
      : '<span class="hub-initial">' + initial() + "</span>";
    btn.title = me ? (me.nickname + " · 个人中心") : "登录";
  }

  function daysChip() {
    if (!profile || !profile.examDate) return "";
    var days = Math.ceil((new Date(profile.examDate + "T00:00:00") - new Date(new Date().toDateString())) / 86400000);
    return days >= 0 ? "距初试 " + days + " 天" : "初试已结束";
  }

  function buildPanel() {
    panel = document.createElement("div");
    panel.className = "hub-panel";
    panel.hidden = true;
    var target = profile ? esc(profile.school || "") + (profile.majorCode ? " · " + esc(profile.majorCode) + " " + esc(profile.majorName || "") : "") : "";
    var motto = profile && profile.motto ? "「" + esc(profile.motto) + "」" : QUOTES[Math.floor(Date.now() / 86400000) % QUOTES.length];
    var src = avatarSrc();
    panel.innerHTML =
      '<div class="hub-card">' +
        '<div class="hub-ava" id="hubAva">' + (src ? '<img src="' + src + '" alt="头像">' : '<span class="hub-initial big">' + initial() + "</span>") + "</div>" +
        '<div class="hub-who"><b>' + esc(me.nickname || "同学") + '</b><span>' + esc(me.phone || "") + "</span>" +
        '<span class="hub-motto">' + motto + "</span></div>" +
      "</div>" +
      '<div class="hub-chips">' + (target ? '<span class="hub-chip">' + target + "</span>" : "") + (daysChip() ? '<span class="hub-chip">' + daysChip() + "</span>" : "") + "</div>" +
      '<div class="hub-menu">' +
        '<button type="button" class="hub-item" id="hubEdit">编辑档案<span>头像 · 格言 · 目标院校</span></button>' +
        '<a class="hub-item" href="community.html">我的社区分享<span>广场与我分享的资料</span></a>' +
        '<a class="hub-item" href="analytics.html" id="hubInboxItem">消息<span id="hubInboxText">批改完成等提醒</span></a>' +
        '<a class="hub-item" id="hubAdmin" href="admin.html" hidden>管理控制台<span>站点管理</span></a>' +
        '<button type="button" class="hub-item" id="hubSettingsBtn">账号设置<span>改密码 · 导出数据 · 注销</span></button>' +
      "</div>" +
      '<div class="hub-settings" id="hubSettings" hidden>' +
        '<form id="hubPwForm"><b>修改密码</b>' +
          '<input type="password" id="hubOldPw" placeholder="旧密码" autocomplete="current-password">' +
          '<input type="password" id="hubNewPw" placeholder="新密码（8–32 位，含字母和数字）" autocomplete="new-password">' +
          '<input type="password" id="hubNewPw2" placeholder="再输一次新密码" autocomplete="new-password">' +
          '<button type="submit" class="hub-act">更新密码</button></form>' +
        '<div class="hub-uiprefs"><b>功能开关（首页扩展）</b>' +
          '<label class="hub-sw"><span>学习计划</span><input type="checkbox" data-uipref="plan"></label>' +
          '<label class="hub-sw"><span>考试节点</span><input type="checkbox" data-uipref="axis"></label>' +
          '<label class="hub-sw"><span>每日一题</span><input type="checkbox" data-uipref="daily"></label>' +
          '<label class="hub-sw"><span>顶栏搜索</span><input type="checkbox" data-uipref="search"></label>' +
          '<p class="hub-sw-note">关掉只隐藏对应卡片或入口，不影响刷题、批改等基本功能。</p></div>' +
        '<div class="hub-row"><b>我的数据</b><button type="button" class="hub-act ghost" id="hubExport">导出全部数据（JSON）</button></div>' +
        '<form id="hubDelForm"><b class="danger">注销账号</b>' +
          '<input type="password" id="hubDelPw" placeholder="输入密码确认注销">' +
          '<button type="submit" class="hub-act danger">永久注销并删除数据</button></form>' +
        '<div id="hubAiCfg"></div>' +
      "</div>" +
      '<p class="hub-msg" id="hubMsg"></p>' +
      '<button type="button" class="hub-logout" id="hubLogout">退出登录</button>';
    document.body.appendChild(panel);
    if (window.AtlasGradeBg) {
      window.AtlasGradeBg.inbox().then(function (list) {
        var unread = (list || []).filter(function (m) { return !m.read; });
        if (!unread.length) return;
        var t = panel.querySelector("#hubInboxText");
        if (t) t.textContent = unread.length + " 条未读 · 最新：" + (unread[0].title || "批改完成");
        var item0 = panel.querySelector("#hubInboxItem");
        if (item0 && unread[0] && unread[0].attemptId) item0.href = "analytics.html?attempt=" + encodeURIComponent(unread[0].attemptId);
        if (btn && !btn.querySelector(".hub-dot")) {
          var dot = document.createElement("span");
          dot.className = "hub-dot";
          btn.appendChild(dot);
        }
      }).catch(function () {});
      var inboxItem = panel.querySelector("#hubInboxItem");
      if (inboxItem) inboxItem.addEventListener("click", function () { window.AtlasGradeBg.markAllRead().catch(function () {}); });
    }
    if (window.AtlasAiCfg) { var aiMount = panel.querySelector('#hubAiCfg'); if (aiMount) window.AtlasAiCfg.renderSettings(aiMount); }
    panel.querySelectorAll("[data-uipref]").forEach(function (cb) {
      var k = cb.getAttribute("data-uipref");
      var prefs = { plan: 1, axis: 1, daily: 1, search: 1 };
      try { var raw = JSON.parse(localStorage.getItem("atlas.uiprefs") || "{}"); Object.keys(prefs).forEach(function (x) { if (raw[x] === 0) prefs[x] = 0; }); } catch (e) {}
      cb.checked = !!prefs[k];
      cb.addEventListener("change", function () {
        if (window.AtlasUiPrefs) window.AtlasUiPrefs.set(k, cb.checked);
        else { prefs[k] = cb.checked ? 1 : 0; try { localStorage.setItem("atlas.uiprefs", JSON.stringify(prefs)); } catch (e) {} }
      });
    });
    panel.querySelector("#hubEdit").onclick = function () {
      closePanel();
      if (window.AtlasProfile && typeof window.AtlasProfile.open === "function") window.AtlasProfile.open();
      else location.href = "index.html#profile";
    };
    panel.querySelector("#hubAva").onclick = function () { panel.querySelector("#hubEdit").click(); };
    panel.querySelector("#hubSettingsBtn").onclick = function () {
      var s = panel.querySelector("#hubSettings");
      s.hidden = !s.hidden;
    };
    panel.querySelector("#hubLogout").onclick = function () {
      api("/api/auth/logout", "POST").catch(function () {}).then(function () { location.href = "login.html"; });
    };
    panel.querySelector("#hubPwForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var oldPw = panel.querySelector("#hubOldPw").value, n1 = panel.querySelector("#hubNewPw").value, n2 = panel.querySelector("#hubNewPw2").value;
      if (!oldPw) return say("请输入旧密码");
      if (!(n1.length >= 8 && n1.length <= 32)) return say("新密码长度需为 8–32 位");
      if (!/[A-Za-z]/.test(n1) || !/\d/.test(n1)) return say("新密码需同时包含字母和数字");
      if (n1 !== n2) return say("两次输入的新密码不一致");
      api("/api/auth/password", "POST", { oldPassword: oldPw, newPassword: n1 })
        .then(function () { e.target.reset(); say("密码已更新", true); })
        .catch(function (err) { say(err.message); });
    });
    panel.querySelector("#hubExport").onclick = function () {
      fetch("/api/auth/export", { credentials: "include" }).then(function (res) {
        if (!res.ok) throw new Error("导出失败（HTTP " + res.status + "）");
        return res.blob();
      }).then(function (blob) {
        var url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = "kaoyan-atlas-export.json";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
        say("已开始下载导出文件", true);
      }).catch(function (err) { say(err.message); });
    };
    panel.querySelector("#hubDelForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var pw = panel.querySelector("#hubDelPw").value;
      if (!pw) return say("请输入密码以确认注销");
      if (!window.confirm("确定要永久注销账号吗？全部学习数据将被删除且不可恢复。")) return;
      if (!window.confirm("最后确认一次：真的要注销并删除全部数据吗？")) return;
      api("/api/auth/delete", "POST", { password: pw })
        .then(function () { alert("账号已注销，感谢使用。"); location.href = "register.html"; })
        .catch(function (err) { say(err.message); });
    });
  }

  function say(msg, ok) {
    var el = panel && panel.querySelector("#hubMsg");
    if (el) { el.textContent = msg || ""; el.className = "hub-msg" + (ok ? " ok" : ""); }
  }

  function openPanel() {
    if (!panel) buildPanel();
    panel.hidden = false;
    btn.classList.add("open");
    if (!adminChecked) {
      adminChecked = true;
      fetch("/api/admin", { credentials: "include" }).then(function (r) {
        if (r.ok) { var a = panel.querySelector("#hubAdmin"); if (a) a.hidden = false; }
      }).catch(function () {});
    }
  }
  function closePanel() { if (panel) panel.hidden = true; if (btn) btn.classList.remove("open"); }

  function mount() {
    var chip = document.getElementById("authChip");
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hub-btn";
    btn.setAttribute("aria-label", "个人中心");
    if (chip && chip.parentElement) {
      chip.parentElement.replaceChild(btn, chip);
    } else {
      var header = document.querySelector("header");
      if (!header) return;
      var wrap = document.createElement("div");
      wrap.className = "hub-wrap";
      wrap.appendChild(btn);
      header.appendChild(wrap);
    }
    if (!me) {
      btn.innerHTML = '<span class="hub-login">登录</span>';
      btn.onclick = function () { location.href = "login.html"; };
      return;
    }
    paintButton();
    btn.onclick = function (e) { e.stopPropagation(); panel && !panel.hidden ? closePanel() : openPanel(); };
    document.addEventListener("click", function (e) { if (panel && !panel.hidden && !panel.contains(e.target)) closePanel(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePanel(); });
  }

  window.addEventListener("atlas:avatar", function (e) {
    if (!profile) profile = {};
    profile.avatarAt = (e.detail && e.detail.avatarAt) || 0;
    paintButton();
    if (panel) { panel.remove(); panel = null; }
  });
  window.AtlasHub = { refresh: function () { location.reload(); } };

  function boot() {
    api("/api/auth/me").then(function (d) {
      me = d.user || null;
      if (!me) { mount(); return; }
      return api("/api/profile").then(function (p) { profile = p.profile || null; }).catch(function () {}).then(mount);
    }).catch(function () { me = null; mount(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
