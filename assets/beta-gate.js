/* 内测版进门校验（仅 dist-beta 构建加载）：内测包含内部资料，不走账号登录（静态包无后端），
 * 改用「内测码」软门禁——打开先验码，通过后本机记住。注意这只是防君子不对防小人的软门禁
 * （纯前端校验），内测包真正的保护是永不公开发布；码要更换时改 EXPECTED 后重跑 --beta 构建。 */
(function () {
  "use strict";
  if (!window.ATLAS_BETA) return;
  var EXPECTED = "70ad10b679a008720b3a0f4f4aa247b44d2c163e646a33cf6919c32dc524dc4c"; // sha256(内测码)
  var EXPECTED_FB = "fallback:fb14a7d05632d46a"; // 非安全上下文兜底哈希（同码）
  var KEY = "atlas_beta_ok";
  function passed() { try { var v = localStorage.getItem(KEY); return v === EXPECTED || v === EXPECTED_FB; } catch (e) { return false; } }
  if (passed()) { document.documentElement.classList.remove("beta-locked"); return; }
  function sha256(text) {
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
        return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
      });
    }
    // 非安全上下文（file:// 等）兜底：简单哈希，仅作软门禁区分，不作安全用途
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < text.length; i++) { var ch = text.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return Promise.resolve("fallback:" + (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16));
  }
  function unlock(hex) {
    try { localStorage.setItem(KEY, hex || EXPECTED); } catch (e) {}
    document.documentElement.classList.remove("beta-locked");
    var ov = document.getElementById("betaGate");
    if (ov) ov.remove();
  }
  function show() {
    if (!document.body) { document.addEventListener("DOMContentLoaded", show); return; }
    var ov = document.createElement("div");
    ov.id = "betaGate";
    ov.setAttribute("style", "visibility:visible;position:fixed;inset:0;z-index:9999;background:#F7F2E8;display:flex;align-items:center;justify-content:center;font-family:inherit");
    ov.innerHTML = '<div style="width:min(340px,86vw);background:#FFFDF7;border:1px solid #E3DCC8;border-radius:14px;padding:28px 24px;box-shadow:0 12px 40px rgba(31,58,95,.18)">' +
      '<div style="font-size:12px;letter-spacing:.18em;color:#A53B30;font-weight:700">INTERNAL BETA</div>' +
      '<div style="font-size:20px;font-weight:800;color:#1F3A5F;margin:8px 0 4px">内测版 · 请输入内测码</div>' +
      '<div style="font-size:12.5px;color:#6B6250;margin-bottom:16px">内测包包含内部资料，仅供内部测试使用。</div>' +
      '<input id="betaCode" type="password" autocomplete="off" placeholder="内测码" style="width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #C9C0A6;border-radius:9px;font-size:15px;background:#FFF">' +
      '<div id="betaErr" style="height:18px;font-size:12px;color:#A53B30;margin:6px 0 2px"></div>' +
      '<button id="betaGo" type="button" style="width:100%;padding:11px;border:0;border-radius:9px;background:#1F3A5F;color:#F7F2E8;font-size:15px;font-weight:700;cursor:pointer">进入内测版</button></div>';
    document.body.appendChild(ov);
    var input = document.getElementById("betaCode");
    var err = document.getElementById("betaErr");
    function submit() {
      var v = (input.value || "").trim();
      if (!v) { err.textContent = "请输入内测码"; return; }
      sha256(v).then(function (hex) {
        if (hex === EXPECTED || hex === EXPECTED_FB) unlock(hex);
        else { err.textContent = "内测码不正确"; input.select(); }
      });
    }
    document.getElementById("betaGo").addEventListener("click", submit);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    input.focus();
  }
  show();
})();
