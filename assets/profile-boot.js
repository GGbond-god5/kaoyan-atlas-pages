(function () {
  "use strict";

  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const SUBJECT_LABELS = { math: "数学一", english: "英语一", mechanics: "807 材料力学", politics: "政治" };

  function shortSchool(name) {
    const s = String(name || "").trim();
    return s.replace(/大学|学院|研究生院/g, "").slice(0, 6) || "目标院校";
  }

  function applyProfile(profile) {
    const A = window.ATLAS;
    if (!A || !profile) return;
    const allowed = new Set(profile.subjects && profile.subjects.length ? profile.subjects : Object.keys(SUBJECT_LABELS));
    A.examDate = profile.examDate || A.examDate;
    A.subjects = (A.subjects || []).filter(s => allowed.has(s.id));
    const mathNames = { math1: "数学一", math2: "数学二", math3: "数学三" };
    const englishNames = { english1: "英语一", english2: "英语二" };
    const variants = profile.variants || {};
    for (const s of A.subjects) {
      if (s.id === "math" && mathNames[variants.math]) s.name = mathNames[variants.math];
      if (s.id === "english" && englishNames[variants.english]) s.name = englishNames[variants.english];
      for (const c of s.chapters) if (c.subjectName) c.subjectName = s.name;
    }
    let chapters = 0, kps = 0;
    for (const s of A.subjects) {
      chapters += s.chapters.length;
      for (const c of s.chapters) kps += c.kps.length;
    }
    A.stats = Object.assign({}, A.stats, { subjects: A.subjects.length, chapters, kps });
    const accents = [["#7A5C3E", "#F0E9DE"], ["#4E6B57", "#E8EFE8"], ["#6B4E6E", "#F0E8F0"]];
    (profile.customSubjects || []).forEach((cs, i) => {
      const [accent, soft] = accents[i % accents.length];
      const id = cs.id || `custom-${i + 1}`;
      const code = cs.code || "专业课";
      A.subjects.push({
        id, name: cs.name, en: "PROFESSIONAL", accent, soft,
        chapterCount: 1, kpCount: 0, examCount: 0,
        blurb: "这门专业课的章节内容尚未录入，可先在资料库上传讲义或真题。",
        chapters: [{
          id: `${id}-intro`, no: "01", title: "内容建设中",
          subtitle: `${code} · ${cs.name}`,
          priority: "", meta: [code, `${cs.fullScore || 150} 分`, "专业课"].filter(Boolean),
          pdf: "", pages: 0, kps: [], topics: [],
          subject: id, subjectName: cs.name, code, accent, soft,
        }],
      });
    });
    A.stats.subjects = A.subjects.length;
    const year = (A.examDate || "").slice(0, 4) || "2027";
    const mark = document.querySelector(".meta-mark");
    if (mark) mark.textContent = `${shortSchool(profile.school)} · ${profile.majorCode}`;
    const watermark = document.querySelector(".watermark");
    if (watermark) watermark.textContent = year;
    const sub = document.querySelector(".brand-sub");
    if (sub) sub.textContent = `KAOYAN ATLAS · ${year}`;
  }

  function loadAtlas() {
    if (window.__atlasMapLoaded) return;
    window.__atlasMapLoaded = true;
    const script = document.createElement("script");
    script.src = "assets/atlas.js?v=20";
    script.onload = () => {
      if (window.AtlasProfile) window.AtlasProfile.afterMap();
    };
    document.body.appendChild(script);
  }

  function ensureDialog() {
    let dialog = document.getElementById("profileDialog");
    if (dialog) return dialog;
    const options = `
      <label class="pf-check"><input type="checkbox" name="subject" value="math"><span>数学</span>
        <select name="variantMath"><option value="math1">数学一</option><option value="math2">数学二</option><option value="math3">数学三</option></select></label>
      <label class="pf-check"><input type="checkbox" name="subject" value="english"><span>英语</span>
        <select name="variantEnglish"><option value="english1">英语一</option><option value="english2">英语二</option></select></label>
      <label class="pf-check"><input type="checkbox" name="subject" value="politics"><span>政治</span></label>
      <label class="pf-check"><input type="checkbox" name="subject" value="mechanics"><span>807 材料力学（内置）</span></label>`;
    dialog = document.createElement("dialog");
    dialog.id = "profileDialog";
    dialog.className = "profile-dialog";
    dialog.innerHTML = `<form id="profileForm" class="profile-card" novalidate>
      <header class="profile-head">
        <div><b>个人档案</b><span>大观会按你的目标院校和科目生成首页图谱</span></div>
        <button type="button" class="profile-close" data-close aria-label="关闭">×</button>
      </header>
      <div class="profile-body">
        <label class="pf-field"><span>院校专业目录</span><input id="programSearch" maxlength="40" placeholder="搜索院校、专业或代码，如 华南理工 085500" autocomplete="off"></label>
        <div class="pf-programs" id="programResults" hidden></div>
        <label class="pf-field"><span>目标院校</span><input name="school" maxlength="40" placeholder="例如：华南理工大学"></label>
        <div class="pf-row">
          <label class="pf-field"><span>专业代码</span><input name="majorCode" maxlength="12" placeholder="085500"></label>
          <label class="pf-field"><span>专业名称</span><input name="majorName" maxlength="30" placeholder="机械"></label>
        </div>
        <div class="pf-row">
          <label class="pf-field"><span>初试日期</span><input type="date" name="examDate"></label>
          <label class="pf-field"><span>每日学习（分钟）</span><input type="number" name="dailyMinutes" min="30" max="900" step="10"></label>
        </div>
        <label class="pf-field"><span>作息类型</span><select name="chronotype">
          <option value="morning">早起型</option><option value="normal">常规型</option><option value="night">夜猫型</option>
        </select></label>
        <fieldset class="pf-subjects"><legend>考试科目</legend>${options}</fieldset>
        <fieldset class="pf-custom"><legend>自定义专业课</legend><div id="customList"></div><button type="button" class="pf-add" id="addCustom">+ 添加专业课</button><p class="pf-hint">例如 822 电子技术基础；添加后可取消勾选 807 材料力学。</p></fieldset>
        <p class="pf-hint">科目决定首页显示哪些图谱；资料、题库和笔记仍然全部可访问。</p>
      </div>
      <footer class="profile-foot">
        <span class="pf-error" id="profileError"></span>
        <button type="button" class="btn ghost" data-close>取消</button>
        <button type="submit" class="btn">保存并应用</button>
      </footer>
    </form>`;
    document.body.appendChild(dialog);
    dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
    dialog.querySelectorAll("[data-close]").forEach(b => b.onclick = () => dialog.close());
    dialog.querySelector("#addCustom").onclick = () => addCustomRow({});
    dialog.querySelector("#profileForm").addEventListener("submit", save);
    bindProgramSearch(dialog);
    return dialog;
  }

  function bindProgramSearch(dialog) {
    const input = dialog.querySelector("#programSearch");
    const results = dialog.querySelector("#programResults");
    let timer = null, programs = [];
    function render() {
      results.innerHTML = programs.length
        ? programs.map((p, i) => `<button type="button" class="pf-program" data-program="${i}">
            <b>${esc(p.school)} · ${esc(p.majorCode)} ${esc(p.majorName)}</b>
            <span>${esc(p.college || "")} · ${esc(p.degreeType || "")} · ${p.year || ""}</span></button>`).join("")
        : `<p class="pf-hint">没有匹配的目录项，可以直接手动填写。</p>`;
      results.hidden = false;
      results.querySelectorAll("[data-program]").forEach(b => {
        b.onclick = () => { applyProgram(programs[Number(b.dataset.program)]); results.hidden = true; input.value = ""; };
      });
    }
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = input.value.trim();
        if (!q) { results.hidden = true; return; }
        try {
          const res = await fetch("/api/programs?q=" + encodeURIComponent(q), { credentials: "include" });
          const data = await res.json();
          programs = data.programs || [];
          render();
        } catch (e) { results.hidden = true; }
      }, 200);
    });
  }

  function applyProgram(program) {
    if (!program) return;
    const form = document.getElementById("profileForm");
    form.school.value = program.school || "";
    form.majorCode.value = program.majorCode || "";
    form.majorName.value = program.majorName || "";
    const subjects = program.subjects || [];
    const kinds = new Set(subjects.map(s => s.kind));
    const builtins = new Set(subjects.map(s => s.builtin).filter(Boolean));
    form.querySelectorAll('input[name="subject"]').forEach(c => {
      c.checked = kinds.has(c.value) || builtins.has(c.value);
    });
    const math = subjects.find(s => s.kind === "math");
    if (math && math.variant) form.variantMath.value = math.variant;
    const english = subjects.find(s => s.kind === "english");
    if (english && english.variant) form.variantEnglish.value = english.variant;
    const list = form.querySelector("#customList");
    list.innerHTML = "";
    subjects.filter(s => s.kind === "professional" && !s.builtin).forEach(s => addCustomRow({ name: s.name, code: s.code, fullScore: s.fullScore }));
    document.getElementById("profileError").textContent = program.note || "";
  }

  function addCustomRow(item) {
    const list = document.getElementById("customList");
    if (!list) return;
    if (list.children.length >= 3) return;
    const row = document.createElement("div");
    row.className = "pf-custom-row";
    row.dataset.id = item.id || "";
    row.innerHTML = `<input name="customName" maxlength="40" placeholder="专业课名称，如 822 电子技术基础" value="${esc(item.name || "")}">
      <input name="customCode" maxlength="12" placeholder="代码" value="${esc(item.code || "")}">
      <select name="customScore"><option value="150">150 分</option><option value="100">100 分</option></select>
      <button type="button" class="pf-remove" aria-label="删除这门专业课">×</button>`;
    row.querySelector("select").value = String(item.fullScore || 150);
    row.querySelector(".pf-remove").onclick = () => row.remove();
    list.appendChild(row);
  }

  function fill(profile) {
    const form = document.getElementById("profileForm");
    if (!form) return;
    form.school.value = profile.school || "";
    form.majorCode.value = profile.majorCode || "";
    form.majorName.value = profile.majorName || "";
    form.examDate.value = profile.examDate || "";
    form.dailyMinutes.value = profile.dailyMinutes || 240;
    form.chronotype.value = profile.chronotype || "normal";
    const chosen = new Set(profile.subjects || []);
    form.querySelectorAll('input[name="subject"]').forEach(c => { c.checked = chosen.has(c.value); });
    const variants = profile.variants || {};
    form.variantMath.value = variants.math || "math1";
    form.variantEnglish.value = variants.english || "english1";
    const list = form.querySelector("#customList");
    list.innerHTML = "";
    (profile.customSubjects || []).forEach(addCustomRow);
    document.getElementById("profileError").textContent = "";
  }

  async function save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const subjects = [...form.querySelectorAll('input[name="subject"]:checked')].map(c => c.value);
    const error = document.getElementById("profileError");
    if (!subjects.length) { error.textContent = "至少选择一门考试科目"; return; }
    const payload = {
      school: form.school.value,
      majorCode: form.majorCode.value,
      majorName: form.majorName.value,
      examDate: form.examDate.value,
      subjects,
      variants: { math: form.variantMath.value, english: form.variantEnglish.value },
      customSubjects: [...form.querySelectorAll(".pf-custom-row")].map(row => ({
        id: row.dataset.id || "",
        name: row.querySelector('[name="customName"]').value.trim(),
        code: row.querySelector('[name="customCode"]').value.trim(),
        fullScore: Number(row.querySelector('[name="customScore"]').value) || 150,
      })).filter(x => x.name),
      dailyMinutes: Number(form.dailyMinutes.value),
      chronotype: form.chronotype.value,
    };
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true; submit.textContent = "保存中…";
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      location.reload();
    } catch (err) {
      error.textContent = `保存失败：${err.message}`;
      submit.disabled = false; submit.textContent = "保存并应用";
    }
  }

  function openDialog(profile) {
    const dialog = ensureDialog();
    fill(profile || window.ATLAS_PROFILE || {});
    if (!dialog.open) dialog.showModal();
  }

  function renderButton(profile) {
    const btn = document.getElementById("profileBtn");
    if (!btn) return;
    btn.textContent = "档案";
    btn.title = `${profile.school} · ${profile.majorCode} ${profile.majorName} · ${profile.examDate}`;
    btn.onclick = () => openDialog(profile);
  }

  function showHint(profile) {
    if (document.getElementById("profileHint")) return;
    const hint = document.createElement("div");
    hint.id = "profileHint";
    hint.className = "profile-hint";
    hint.innerHTML = `当前是默认档案（${esc(profile.school)} · ${esc(profile.majorCode)}）。<button type="button">按我的考试信息生成</button>`;
    hint.querySelector("button").onclick = () => openDialog(profile);
    const stage = document.getElementById("stage");
    if (stage) stage.appendChild(hint);
  }

  async function boot() {
    let profile = null;
    try {
      const res = await fetch("/api/profile", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        profile = data.profile || null;
      }
    } catch (e) { /* 离线或接口不可用时按完整图谱展示 */ }
    window.ATLAS_PROFILE = profile;
    window.__profileBoot = { hasProfile: !!profile, isDefault: !!(profile && profile.isDefault) };
    if (profile) applyProfile(profile);
    renderButton(profile || {});
    loadAtlas();
    if (profile && profile.isDefault) {
      showHint(profile);
      try {
        if (!localStorage.getItem("atlas.profile.prompted")) {
          localStorage.setItem("atlas.profile.prompted", "1");
          setTimeout(() => openDialog(profile), 700);
        }
      } catch (e) { /* ignore */ }
    } else {
      // 浏览器可能恢复上一次的表单/弹窗状态；非默认档案下强制关闭
      setTimeout(() => { const d = document.getElementById("profileDialog"); if (d && d.open) d.close(); }, 50);
    }
  }

  window.AtlasProfile = { open: () => openDialog(window.ATLAS_PROFILE), afterMap: () => {} };
  boot();
})();
