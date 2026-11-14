/* KaTeX 体积大且只在阅读讲义/笔记时才需要，首屏不加载。
   调用方用 AtlasKatex.render(root) 代替直接调 renderMathInElement。 */
(function () {
  "use strict";

  const BASE = "assets/katex/";
  const DELIMS = [
    { left: "\\(", right: "\\)", display: false },
    { left: "\\[", right: "\\]", display: true },
  ];

  let pending = null;

  function loadScript(src) {
    return new Promise(resolve => {
      const el = document.createElement("script");
      el.src = src;
      el.onload = resolve;
      el.onerror = resolve;
      document.head.appendChild(el);
    });
  }

  function ensure() {
    if (window.renderMathInElement) return Promise.resolve(true);
    if (!pending) {
      pending = loadScript(BASE + "katex.min.js")
        .then(() => (window.katex ? loadScript(BASE + "contrib/auto-render.min.js") : null))
        .then(() => !!window.renderMathInElement);
    }
    return pending;
  }

  function render(root) {
    if (!root) return Promise.resolve();
    return ensure().then(ok => {
      if (!ok) return;
      try {
        window.renderMathInElement(root, { delimiters: DELIMS, throwOnError: false });
      } catch (err) { /* 保留原文，别让公式拖垮整页 */ }
    });
  }

  window.AtlasKatex = { ensure, render };
})();
