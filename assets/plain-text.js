/* 把 AI 生成文本里的 Markdown 符号洗掉，只留自然文字：显示层兜底，
   与 prompts.js 里的 PLAIN_STYLE（生成层要求）配套。 */
(function () {
  'use strict';
  function clean(text) {
    if (text == null) return '';
    var s = String(text);
    s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
    s = s.replace(/__([^_]+)__/g, '$1');
    s = s.replace(/```[a-zA-Z]*\n?/g, '');
    s = s.replace(/`/g, '');
    s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '');
    s = s.replace(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/gm, '');
    s = s.replace(/^\s*>\s?/gm, '');
    s = s.replace(/^\s*[-*+•]\s+/gm, '');
    s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
    s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');
    s = s.replace(/[ \t]{2,}/g, ' ');
    s = s.replace(/\n{3,}/g, '\n\n');
    return s.trim();
  }
  window.AtlasPlain = { clean: clean };
})();
