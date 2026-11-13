(function () {
  "use strict";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  function renderMastery(host, questions, results) {
    // 题型映射仅呈现已评分题的得分侧面，不把题型得分当成独立能力测量。
    const dimensions = [
      {name:"客观辨析", kinds:["选择题","单选题","多选题","单项选择题","多项选择题"]},
      {name:"信息理解", kinds:["完形","阅读","新题型"]},
      {name:"翻译表达", kinds:["翻译"]},
      {name:"写作表达", kinds:["小作文","大作文"]},
      {name:"计算求解", kinds:["计算题","填空题"]},
      {name:"论证分析", kinds:["证明题","解答题","分析题","简答题"]}
    ].map(d => ({...d, count:0, graded:0, score:0, max:0}));
    const topics = new Map();
    function add(target, result) {
      target.count++;
      if (result && result.status === "graded" && result.maxScore != null && Number.isFinite(Number(result.maxScore)) && Number(result.maxScore) > 0 && result.score != null && Number.isFinite(Number(result.score))) {
        target.graded++; target.score += Number(result.score); target.max += Number(result.maxScore);
      }
    }
    questions.forEach(q => {
      const name = q.topicTitle || q.chapterTitle || q.kpName || "未分类";
      if (!topics.has(name)) topics.set(name, {count:0, graded:0, score:0, max:0});
      const result = results[q.id]; add(topics.get(name), result);
      const dim = dimensions.find(d => d.kinds.includes(q.kind)); if (dim) add(dim, result);
    });
    const axes = dimensions.map((d,i) => {
      const angle = Math.PI * 2 * i / 6 - Math.PI / 2;
      const x = 100 + 80*Math.cos(angle), y = 100 + 80*Math.sin(angle);
      return `<line x1="100" y1="100" x2="${x}" y2="${y}" stroke="#cbbba7"/>`;
    }).join("");
    const positions = dimensions.map((d,i) => { const angle = Math.PI * 2 * i / 6 - Math.PI / 2; const radius = d.max ? 80 * Math.max(0, Math.min(1,d.score/d.max)) : 0; return [100+radius*Math.cos(angle),100+radius*Math.sin(angle)]; });
    const polygon = dimensions.every(d => d.max) ? `<polygon points="${positions.map(p=>p.join(",")).join(" ")}" fill="#ad493d55" stroke="#a53b30"/>` : "";
    const dots = positions.map(([x,y],i) => dimensions[i].max ? `<circle cx="${x}" cy="${y}" r="3" fill="#a53b30"/>` : "").join("");
    const basis = v => v.max ? `已评分 ${v.graded} 题，${v.score} / ${v.max} 分（${Math.round(v.score/v.max*100)}%）` : "待评估（没有可计分结果）";
    const list = [...topics.entries()];
    host.innerHTML = `<h3>能力与知识点覆盖</h3><button type="button" id="masteryOpen">查看能力与知识点图</button><dialog id="masteryDialog"><h3>能力与知识点依据</h3><p>按题型归入六个能力侧面，数值为已评分题的得分比例，并非独立能力测量。无数据的轴不绘点；六项均有数据时才绘制面积。实际覆盖 ${questions.length} 题。</p><svg viewBox="0 0 200 200" width="180" height="180" role="img" aria-label="按下列顺序排列的六个具名能力侧面，详细题数与得分见文字"><polygon points="100,20 169,60 169,140 100,180 31,140 31,60" fill="none" stroke="#cbbba7"/>${axes}${polygon}${dots}</svg><ol>${dimensions.map(d => `<li><b>${esc(d.name)}</b>（${esc(d.kinds.join("、"))}）：覆盖 ${d.count} 题；${basis(d)}</li>`).join("")}</ol><h3>知识点掌握</h3><ul>${list.map(([name,v]) => `<li>${esc(name)}：覆盖 ${v.count} 题；${basis(v)}${v.max ? `<div role="img" aria-label="得分比例 ${Math.round(v.score/v.max*100)}%" style="height:6px;max-width:220px;background:#eadfd1"><div style="height:100%;width:${Math.max(0,Math.min(100,v.score/v.max*100))}%;background:#a53b30"></div></div>` : ""}</li>`).join("")}</ul><button type="button" id="masteryClose">关闭</button></dialog>`;
    const dialog = host.querySelector("dialog"); host.querySelector("#masteryOpen").onclick = () => dialog.showModal(); host.querySelector("#masteryClose").onclick = () => dialog.close();
  }
  function open(context) {
    let dialog = document.getElementById("atlasCoach");
    if (!dialog) { dialog = document.createElement("dialog"); dialog.id = "atlasCoach"; dialog.innerHTML = '<h3>写作与翻译指导</h3><div class="coach-log" aria-live="polite"></div><textarea aria-label="向 AI 提问" placeholder="输入你的作答或追问"></textarea><p><button type="button" data-send>发送</button> <button type="button" data-close>关闭</button></p>'; document.body.appendChild(dialog); }
    const log = dialog.querySelector(".coach-log"), input = dialog.querySelector("textarea"), send = dialog.querySelector("[data-send]");
    let messages = [], conversationId = null; log.textContent = ""; input.value = "";
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    send.onclick = async () => {
      const content = input.value.trim(); if (!content) return;
      messages.push({role:"user",content}); input.value = ""; log.textContent += `你：${content}\n`; send.disabled = true;
      try { await window.AtlasUser.ready; const data = await window.AtlasUser.json("/api/coach", "POST", {conversationId,context,messages}); conversationId = data.conversationId; messages.push({role:"assistant",content:data.reply}); log.textContent += `指导：${data.reply}\n`; }
      catch (err) { messages.pop(); input.value = content; log.textContent += `发送失败：${err.message}，可重试。\n`; }
      finally { send.disabled = false; }
    };
    dialog.showModal(); input.focus();
  }
  window.AtlasAssessment = {renderMastery}; window.AtlasCoach = {open};
})();
