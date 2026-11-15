(function () {
  "use strict";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  function renderMastery(host, questions, results) {
    // 分科能力指标：每个科目用自己的指标体系（数学没有写作、英语没有协调方程）。
    // 数据优先用批改返回的 dimensions（分科能力评分），其次用同名得分点，最后按题型归入对应指标。
    const SETS = {
      math: { dims: ["概念与定理理解", "方法与思路选择", "推导与计算准确", "审题与条件运用", "步骤规范与结论", "综合迁移与创新"], short: ["概念", "方法", "计算", "审题", "规范", "综合"],
        kindMap: {"选择题": "概念与定理理解", "单选题": "概念与定理理解", "多选题": "概念与定理理解", "单项选择题": "概念与定理理解", "多项选择题": "概念与定理理解", "填空题": "推导与计算准确", "计算题": "推导与计算准确", "解答题": "方法与思路选择", "证明题": "步骤规范与结论", "综合题": "综合迁移与创新"} },
      mechanics: { dims: ["受力分析与平衡方程", "协调与几何关系", "公式与计算", "边界与约束判断", "量纲与量级", "校核与结论"], short: ["平衡", "协调", "公式", "边界", "量纲", "校核"],
        kindMap: {"选择题": "公式与计算", "单选题": "公式与计算", "多选题": "公式与计算", "填空题": "公式与计算", "计算题": "公式与计算", "解答题": "受力分析与平衡方程", "分析题": "受力分析与平衡方程"} },
      politics: { dims: ["知识点定位", "采分点覆盖", "材料结合", "理论阐释", "时政结合", "条理与表述"], short: ["定位", "覆盖", "材料", "阐释", "时政", "条理"],
        kindMap: {"单选题": "知识点定位", "多选题": "知识点定位", "选择题": "知识点定位", "单项选择题": "知识点定位", "多项选择题": "知识点定位", "简答题": "采分点覆盖", "辨析题": "采分点覆盖", "分析题": "材料结合", "材料分析题": "材料结合", "论述题": "条理与表述"} },
      english: { dims: ["定位与理解", "推理与排除", "语言基础", "意群与句法", "篇章与逻辑", "写作表达"], short: ["定位", "推理", "语言", "句法", "篇章", "写作"],
        dimMap: {"定位与理解": "定位与理解", "推理与排除": "推理与排除", "语言基础": "语言基础", "意群理解": "意群与句法", "句法处理": "意群与句法", "词义准确": "语言基础", "表达通顺": "篇章与逻辑", "篇章与逻辑": "篇章与逻辑", "内容要点": "写作表达", "内容": "写作表达", "格式与语域": "写作表达", "结构": "篇章与逻辑", "连贯与衔接": "篇章与逻辑", "语言准确性": "语言基础", "语言丰富度": "语言基础", "语法与拼写": "语言基础"},
        kindMap: {"阅读": "定位与理解", "阅读理解": "定位与理解", "完形": "定位与理解", "完形填空": "定位与理解", "新题型": "篇章与逻辑", "选择题": "定位与理解", "单选题": "定位与理解", "翻译": "意群与句法", "小作文": "写作表达", "大作文": "写作表达"} },
      generic: { dims: ["知识理解", "概念辨析", "方法运用", "分析推理", "表达规范", "综合应用"], short: ["理解", "辨析", "运用", "推理", "表达", "综合"],
        kindMap: {"选择题": "知识理解", "单选题": "知识理解", "多选题": "知识理解", "填空题": "知识理解", "解答题": "方法运用", "计算题": "方法运用", "分析题": "方法运用", "简答题": "表达规范"} }
    };
    SETS.math2 = SETS.math; SETS.english2 = SETS.english;
    const SUBJECT_NAMES = { math: "数学一", math2: "数学二", english: "英语一", english2: "英语二", mechanics: "807 材料力学", politics: "政治" };
    const radarQ = questions[0] || {};
    const radarSubject = radarQ.subject || "";
    const R = SETS[radarSubject] || SETS.generic;
    const dimensions = R.dims.map(name => ({ name, count: 0, graded: 0, score: 0, max: 0 }));
    const byName = {}; dimensions.forEach(d => { byName[d.name] = d; });
    function dimValue(v, qMax) {
      if (v && typeof v === "object") { const sc = Number(v.score), mx = Number(v.max); if (Number.isFinite(sc) && Number.isFinite(mx) && mx > 0) return [sc, mx]; if (Number.isFinite(sc)) return [sc, qMax]; return null; }
      if (typeof v === "string") { const m = v.match(/([\d.]+)\s*\/\s*([\d.]+)/); if (m) return [Number(m[1]), Number(m[2])]; const n = Number(v); if (Number.isFinite(n)) return n <= 1 ? [n * qMax, qMax] : [n, qMax]; return null; }
      if (typeof v === "number" && Number.isFinite(v)) return v <= 1 ? [v * qMax, qMax] : [v, qMax];
      return null;
    }
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
      if ((q.subject || "") !== radarSubject) return;
      const graded = result && result.status === "graded" && Number(result.maxScore) > 0 && Number.isFinite(Number(result.score));
      let fed = false;
      if (graded && result.dimensions && typeof result.dimensions === "object") {
        Object.keys(result.dimensions).forEach(k => {
          const target = (R.dimMap && R.dimMap[k]) || (byName[k] ? k : null);
          if (!target) return;
          const dv = dimValue(result.dimensions[k], Number(result.maxScore));
          if (!dv) return;
          const d = byName[target]; d.count++; d.graded++; d.score += dv[0]; d.max += dv[1]; fed = true;
        });
      }
      if (graded && !fed && Array.isArray(result.breakdown)) {
        result.breakdown.forEach(b => {
          if (!b || !byName[b.point]) return;
          const sc = Number(b.score), mx = Number(b.max);
          if (!Number.isFinite(sc) || !Number.isFinite(mx) || mx <= 0) return;
          const d = byName[b.point]; d.count++; d.graded++; d.score += sc; d.max += mx; fed = true;
        });
      }
      if (!fed) {
        const target = R.kindMap[q.kind];
        if (target && byName[target]) { const d = byName[target]; d.count++; if (graded) { d.graded++; d.score += Number(result.score); d.max += Number(result.maxScore); } }
      }
    });
    const N = dimensions.length;
    const angleOf = i => Math.PI * 2 * i / N - Math.PI / 2;
    const pt = (i, r) => [100 + r * Math.cos(angleOf(i)), 100 + r * Math.sin(angleOf(i))];
    const ring = r => `<polygon points="${dimensions.map((d, i) => pt(i, r).map(v => v.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="#cbbba7"/>`;
    const axes = dimensions.map((d, i) => { const [x, y] = pt(i, 80); return `<line x1="100" y1="100" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#cbbba7"/>`; }).join("");
    const ratioOf = d => d.max ? Math.max(0, Math.min(1, d.score / d.max)) : 0;
    const covered = dimensions.filter(d => d.max).length;
    const positions = dimensions.map((d, i) => pt(i, 80 * ratioOf(d)));
    const polygon = covered >= 3 ? `<polygon points="${positions.map(p => p.map(v => v.toFixed(1)).join(",")).join(" ")}" fill="#ad493d55" stroke="#a53b30"/>` : "";
    const sectors = covered > 0 && covered < 3 ? dimensions.map((d, i) => {
      const ratio = ratioOf(d); if (!ratio) return "";
      const angle = angleOf(i), a0 = angle - Math.PI / N, a1 = angle + Math.PI / N, r = Math.max(10, 80 * ratio);
      const x0 = 100 + r * Math.cos(a0), y0 = 100 + r * Math.sin(a0);
      const x1 = 100 + r * Math.cos(a1), y1 = 100 + r * Math.sin(a1);
      return `<path d="M100,100 L${x0.toFixed(1)},${y0.toFixed(1)} A${r.toFixed(1)},${r.toFixed(1)} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z" fill="#ad493d55" stroke="#a53b30"/>`;
    }).join("") : "";
    const dots = covered >= 3 ? positions.map(([x, y], i) => dimensions[i].max ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#a53b30"/>` : "").join("") : "";
    const labels = dimensions.map((d, i) => {
      const [x, y] = pt(i, 92);
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="7.5" text-anchor="middle" dominant-baseline="middle" fill="#8a7d6b">${esc(R.short[i] || d.name)}</text>`;
    }).join("");
    const fmt = v => Math.round(v * 10) / 10;
    const basis = v => v.max ? `已评分 ${v.graded} 题，${fmt(v.score)} / ${fmt(v.max)} 分（${Math.round(v.score / v.max * 100)}%）` : "待评估（没有可计分结果）";
    const list = [...topics.entries()];
    const subjectLabel = radarQ.subjectName || SUBJECT_NAMES[radarSubject] || radarSubject || "本套";
    host.innerHTML = `<h3>能力与知识点覆盖</h3><button type="button" id="masteryOpen">查看能力与知识点图</button><dialog id="masteryDialog"><h3>能力与知识点依据</h3><p>能力指标按科目区分：${esc(subjectLabel)}采用「${R.dims.join("、")}」。数值来自批改的能力维度评分（已评分题的得分比例）；暂无维度评分的题按题型归入对应指标，并非独立能力测量。面积越大表示该指标得分比例越高；至少 3 个指标有已评分数据时画雷达面积，不足时用扇形面积展示。实际覆盖 ${questions.length} 题。</p><svg viewBox="0 0 200 200" width="180" height="180" role="img" aria-label="${esc(subjectLabel)}能力雷达图，详细题数与得分见文字">${ring(80)}${ring(40)}${axes}${sectors}${polygon}${dots}${labels}</svg><ol>${dimensions.map(d => `<li><b>${esc(d.name)}</b>：覆盖 ${d.count} 题；${basis(d)}</li>`).join("")}</ol><h3>知识点掌握</h3><ul>${list.map(([name,v]) => `<li>${esc(name)}：覆盖 ${v.count} 题；${basis(v)}${v.max ? `<div role="img" aria-label="得分比例 ${Math.round(v.score/v.max*100)}%" style="height:6px;max-width:220px;background:#eadfd1"><div style="height:100%;width:${Math.max(0,Math.min(100,v.score/v.max*100))}%;background:#a53b30"></div></div>` : ""}</li>`).join("")}</ul><button type="button" id="masteryClose">关闭</button></dialog>`;
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
        const refs = Array.isArray(data.references) && data.references.length ? `\n\n参考：${data.references.join("、")}` : "";
        typing.remove(); bubble(log, "assistant", data.reply + refs);
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
