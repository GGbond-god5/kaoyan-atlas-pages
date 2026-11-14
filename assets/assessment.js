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
    const ratioOf = d => d.max ? Math.max(0, Math.min(1, d.score / d.max)) : 0;
    const covered = dimensions.filter(d => d.max).length;
    const short = ["客观", "理解", "翻译", "写作", "计算", "论证"];
    const angleOf = i => Math.PI * 2 * i / 6 - Math.PI / 2;
    const positions = dimensions.map((d, i) => {
      const angle = angleOf(i), radius = 80 * ratioOf(d);
      return [100 + radius * Math.cos(angle), 100 + radius * Math.sin(angle)];
    });
    const polygon = covered >= 3 ? `<polygon points="${positions.map(p => p.join(",")).join(" ")}" fill="#ad493d55" stroke="#a53b30"/>` : "";
    const sectors = covered > 0 && covered < 3 ? dimensions.map((d, i) => {
      const ratio = ratioOf(d); if (!ratio) return "";
      const angle = angleOf(i), a0 = angle - Math.PI / 6, a1 = angle + Math.PI / 6, r = Math.max(10, 80 * ratio);
      const x0 = 100 + r * Math.cos(a0), y0 = 100 + r * Math.sin(a0);
      const x1 = 100 + r * Math.cos(a1), y1 = 100 + r * Math.sin(a1);
      return `<path d="M100,100 L${x0.toFixed(1)},${y0.toFixed(1)} A${r.toFixed(1)},${r.toFixed(1)} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z" fill="#ad493d55" stroke="#a53b30"/>`;
    }).join("") : "";
    const dots = covered >= 3 ? positions.map(([x, y], i) => dimensions[i].max ? `<circle cx="${x}" cy="${y}" r="3" fill="#a53b30"/>` : "").join("") : "";
    const labels = dimensions.map((d, i) => {
      const angle = angleOf(i), x = 100 + 90 * Math.cos(angle), y = 100 + 90 * Math.sin(angle);
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="7.5" text-anchor="middle" dominant-baseline="middle" fill="#8a7d6b">${short[i]}</text>`;
    }).join("");
    const basis = v => v.max ? `已评分 ${v.graded} 题，${v.score} / ${v.max} 分（${Math.round(v.score/v.max*100)}%）` : "待评估（没有可计分结果）";
    const list = [...topics.entries()];
    host.innerHTML = `<h3>能力与知识点覆盖</h3><button type="button" id="masteryOpen">查看能力与知识点图</button><dialog id="masteryDialog"><h3>能力与知识点依据</h3><p>按题型归入六个能力侧面，数值为已评分题的得分比例，并非独立能力测量。面积越大表示该维度得分比例越高；至少 3 个维度有已评分数据时画雷达面积，不足时用扇形面积展示。实际覆盖 ${questions.length} 题。</p><svg viewBox="0 0 200 200" width="180" height="180" role="img" aria-label="按下列顺序排列的六个具名能力侧面，详细题数与得分见文字"><polygon points="100,20 169,60 169,140 100,180 31,140 31,60" fill="none" stroke="#cbbba7"/>${axes}${sectors}${polygon}${dots}${labels}</svg><ol>${dimensions.map(d => `<li><b>${esc(d.name)}</b>（${esc(d.kinds.join("、"))}）：覆盖 ${d.count} 题；${basis(d)}</li>`).join("")}</ol><h3>知识点掌握</h3><ul>${list.map(([name,v]) => `<li>${esc(name)}：覆盖 ${v.count} 题；${basis(v)}${v.max ? `<div role="img" aria-label="得分比例 ${Math.round(v.score/v.max*100)}%" style="height:6px;max-width:220px;background:#eadfd1"><div style="height:100%;width:${Math.max(0,Math.min(100,v.score/v.max*100))}%;background:#a53b30"></div></div>` : ""}</li>`).join("")}</ul><button type="button" id="masteryClose">关闭</button></dialog>`;
    const dialog = host.querySelector("dialog"); host.querySelector("#masteryOpen").onclick = () => dialog.showModal(); host.querySelector("#masteryClose").onclick = () => dialog.close();
  }
  function ensureCoachCss() {
    if (document.querySelector("link[data-coach-css]")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = "assets/coach.css?v=3"; link.dataset.coachCss = "1";
    document.head.appendChild(link);
  }
  function bubble(log, role, text, typing) {
    const row = document.createElement("div");
    row.className = "coach-row " + role;
    const avatar = document.createElement("span");
    avatar.className = "coach-bubble-avatar";
    avatar.textContent = role === "user" ? "你" : "AI";
    const body = document.createElement("div");
    body.className = "coach-bubble";
    if (typing) body.innerHTML = '<span class="coach-dots"><i></i><i></i><i></i></span>';
    else body.textContent = text;
    row.append(avatar, body);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    return row;
  }
  function open(context) {
    ensureCoachCss();
    let dialog = document.getElementById("atlasCoach");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "atlasCoach"; dialog.className = "coach";
      dialog.innerHTML = `<div class="coach-card">
        <header class="coach-head">
          <div class="coach-avatar">AI</div>
          <div class="coach-title"><b>写作与翻译指导</b><span data-context></span></div>
          <button class="coach-close" type="button" data-close aria-label="关闭">×</button>
        </header>
        <div class="coach-log" aria-live="polite"></div>
        <form class="coach-compose">
          <textarea rows="3" aria-label="向 AI 提问" placeholder="把你的作文或翻译贴在这里，也可以继续追问…"></textarea>
          <div class="coach-actions"><span class="coach-hint">Enter 发送 · Shift+Enter 换行</span><button class="coach-send" type="submit" data-send>发送</button></div>
        </form>
      </div>`;
      document.body.appendChild(dialog);
    }
    const log = dialog.querySelector(".coach-log"), input = dialog.querySelector("textarea"),
      send = dialog.querySelector("[data-send]"), form = dialog.querySelector(".coach-compose"),
      subtitle = dialog.querySelector("[data-context]");
    subtitle.textContent = (context && context.question && context.question.kpName) || (context && context.title) || (context && context.subject) || "考研写作与翻译";
    let messages = [], conversationId = null, busy = false;
    log.innerHTML = "";
    bubble(log, "assistant", "把你要练的作文或翻译发给我，我会给出逐句修改、失分点和润色参考。");
    input.value = "";
    function setBusy(value) {
      busy = value; send.disabled = value; input.disabled = value;
      dialog.classList.toggle("busy", value);
    }
    async function submit() {
      const content = input.value.trim();
      if (!content || busy) return;
      bubble(log, "user", content);
      messages.push({role: "user", content});
      input.value = ""; setBusy(true);
      const typing = bubble(log, "assistant", "", true);
      try {
        await window.AtlasUser.ready;
        const data = await window.AtlasUser.json("/api/coach", "POST", {conversationId, context, messages});
        conversationId = data.conversationId;
        messages.push({role: "assistant", content: data.reply});
        typing.remove(); bubble(log, "assistant", data.reply);
      } catch (err) {
        messages.pop(); typing.remove();
        bubble(log, "assistant", `发送失败：${err.message}。请稍后重试。`);
        input.value = content;
      } finally {
        setBusy(false); input.focus();
      }
    }
    form.onsubmit = event => { event.preventDefault(); submit(); };
    input.onkeydown = event => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); }
    };
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    if (!dialog.open) dialog.showModal();
    setTimeout(() => input.focus(), 60);
  }
  window.AtlasAssessment = {renderMastery}; window.AtlasCoach = {open};
})();
