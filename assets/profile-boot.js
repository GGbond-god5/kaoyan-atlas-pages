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
    script.src = "assets/atlas.js?v=22";
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
        <div class="pf-card">
          <div class="pf-avatar-row">
            <img id="pfAvatar" class="pf-avatar" alt="我的头像" hidden>
            <div id="pfAvatarFallback" class="pf-avatar pf-avatar-fallback">观</div>
            <div class="pf-avatar-actions">
              <label class="pf-upload">更换头像<input type="file" id="pfAvatarFile" accept="image/*" hidden></label>
              <button type="button" class="pf-avatar-del" id="pfAvatarDel" hidden>删除头像</button>
              <span class="pf-hint">自动裁成正方形，2MB 以内</span>
            </div>
          </div>
          <div class="pf-chips" id="pfChips"></div>
          <p class="pf-quote" id="pfQuote"></p>
          <label class="pf-field"><span>我的格言</span><input name="motto" maxlength="60" placeholder="一句陪你上岸的话，如：山海可平，功不唐捐"></label>
        </div>
        <label class="pf-field"><span>院校专业目录</span><input id="programSearch" maxlength="40" placeholder="输入学校名或代码，从 2027 全国研招目录里选" autocomplete="off"></label>
        <div class="pf-programs" id="programResults" hidden></div>
        <label class="pf-field"><span>目标院校</span><input name="school" maxlength="40" placeholder="例如：华南理工大学"></label>
        <div class="pf-row">
          <label class="pf-field"><span>专业代码</span><input name="majorCode" maxlength="12" placeholder="085500"></label>
          <label class="pf-field"><span>专业名称</span><input name="majorName" maxlength="30" placeholder="机械"></label>
        </div>
        <div class="pf-row">
          <label class="pf-field"><span>初试日期</span><input type="date" name="examDate"></label>
          <label class="pf-field"><span>每日学习（小时）</span><input type="number" name="dailyHours" min="0.5" max="24" step="0.5"></label>
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
    dialog.querySelector("#pfAvatarFile").addEventListener("change", onAvatarFile);
    dialog.querySelector("#pfAvatarDel").onclick = onAvatarDelete;
    bindProgramSearch(dialog);
    return dialog;
  }

  const QUOTES = ["山海可平，功不唐捐。", "日拱一卒，功不唐捐。", "把题做对，把心放稳。", "慢就是快，基础不牢，地动山摇。", "错题是地图，不是判决。", "今天多算一遍，明天少慌一分。", "上岸不是奇迹，是重复。"];
  function titleFor(seen) {
    return seen === 0 ? "尚未启程" : seen < 50 ? "晨光初醒" : seen < 150 ? "执笔为剑" : seen < 300 ? "破卷有声" : seen < 600 ? "拾级而上" : seen < 1000 ? "登堂入室" : "山海可平";
  }

  function paintAvatar(profile) {
    const img = document.getElementById("pfAvatar");
    const fb = document.getElementById("pfAvatarFallback");
    const del = document.getElementById("pfAvatarDel");
    if (!img) return;
    if (profile && profile.avatarAt) {
      img.src = `/api/profile/avatar?v=${profile.avatarAt}`;
      img.hidden = false; fb.hidden = true; del.hidden = false;
    } else {
      img.hidden = true; fb.hidden = false; del.hidden = true;
    }
    window.dispatchEvent(new CustomEvent("atlas:avatar", { detail: { avatarAt: (profile && profile.avatarAt) || 0 } }));
  }

  async function fillChips(profile) {
    const el = document.getElementById("pfChips");
    const quote = document.getElementById("pfQuote");
    if (quote) quote.textContent = profile.motto ? `「${profile.motto}」` : `今日一句：${QUOTES[Math.floor(Date.now() / 86400000) % QUOTES.length]}`;
    if (!el) return;
    const chips = [];
    if (profile.examDate) {
      const days = Math.ceil((new Date(profile.examDate + "T00:00:00") - new Date(new Date().toDateString())) / 86400000);
      chips.push(days >= 0 ? `距初试 ${days} 天` : "初试已结束，加油等成绩");
    }
    el.innerHTML = chips.map(c => `<span class="pf-chip">${esc(c)}</span>`).join("");
    try {
      if (!window.AtlasUser) return;
      const st = await window.AtlasUser.load("practice", { rec: {} });
      const rec = (st && st.rec) || {};
      let seen = 0, okN = 0;
      for (const k in rec) { seen += rec[k].seen || 0; okN += rec[k].ok || 0; }
      chips.push(`累计刷题 ${seen}`, `称号 · ${titleFor(seen)}`);
      if (seen) chips.push(`正确率 ${Math.round((okN / seen) * 100)}%`);
      el.innerHTML = chips.map(c => `<span class="pf-chip">${esc(c)}</span>`).join("");
    } catch (e) { /* 统计失败不影响档案 */ }
  }

  async function onAvatarFile(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      const bmp = await createImageBitmap(file);
      const size = 256, canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      const scale = Math.max(size / bmp.width, size / bmp.height);
      const w = bmp.width * scale, h = bmp.height * scale;
      canvas.getContext("2d").drawImage(bmp, (size - w) / 2, (size - h) / 2, w, h);
      bmp.close();
      const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.85));
      if (!blob) throw new Error("图片处理失败");
      const res = await fetch("/api/profile/avatar", { method: "POST", credentials: "include", headers: { "Content-Type": "image/jpeg" }, body: blob });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      window.ATLAS_PROFILE = Object.assign({}, window.ATLAS_PROFILE, { avatarAt: data.avatarAt, avatarType: "image/jpeg" });
      paintAvatar(window.ATLAS_PROFILE);
    } catch (err) {
      const error = document.getElementById("profileError");
      if (error) error.textContent = `头像上传失败：${err.message}`;
    }
  }

  async function onAvatarDelete() {
    if (!confirm("删除当前头像？")) return;
    try {
      const res = await fetch("/api/profile/avatar", { method: "DELETE", credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      window.ATLAS_PROFILE = Object.assign({}, window.ATLAS_PROFILE, { avatarAt: 0, avatarType: "" });
      paintAvatar(window.ATLAS_PROFILE);
    } catch (err) {
      const error = document.getElementById("profileError");
      if (error) error.textContent = `头像删除失败：${err.message}`;
    }
  }

  let catalogIndex = null, catalogLoading = null;
  const schoolCache = {};
  function loadCatalogIndex() {
    if (catalogIndex) return Promise.resolve(catalogIndex);
    if (!catalogLoading) {
      catalogLoading = fetch("/assets/catalog/index.json", { credentials: "include" })
        .then(r => { if (!r.ok) throw new Error("catalog"); return r.json(); })
        .then(list => { catalogIndex = list; return list; })
        .catch(e => { catalogLoading = null; throw e; });
    }
    return catalogLoading;
  }
  function loadSchoolFile(dwdm) {
    if (schoolCache[dwdm]) return Promise.resolve(schoolCache[dwdm]);
    return fetch("/assets/catalog/" + encodeURIComponent(dwdm) + ".json", { credentials: "include" })
      .then(r => { if (!r.ok) throw new Error("school"); return r.json(); })
      .then(d => { schoolCache[dwdm] = d; return d; });
  }
  function mapCatalogSubjects(list, schoolName) {
    const notes = [];
    const subjects = (list || []).map(pair => {
      const code = String(pair[0] || ""), name = String(pair[1] || "");
      if (code === "101") return { kind: "politics", name: "101 思想政治理论", code, fullScore: 100 };
      if (code === "201") return { kind: "english", variant: "english1", name: "201 英语（一）", code, fullScore: 100 };
      if (code === "204") return { kind: "english", variant: "english2", name: "204 英语（二）", code, fullScore: 100 };
      if (/^2\d\d$/.test(code)) { notes.push(`外语科目为 ${code} ${name}，已按英语一暂代，请按实际语种复习`); return { kind: "english", variant: "english1", name: `${code} ${name}`, code, fullScore: 100 }; }
      if (code === "301") return { kind: "math", variant: "math1", name: "301 数学（一）", code, fullScore: 150 };
      if (code === "302") return { kind: "math", variant: "math2", name: "302 数学（二）", code, fullScore: 150 };
      if (code === "303") return { kind: "math", variant: "math3", name: "303 数学（三）", code, fullScore: 150 };
      if (code === "199") return { kind: "professional", name: "199 管理类综合能力", code, fullScore: 200 };
      if (code === "396") return { kind: "professional", name: "396 经济类综合能力", code, fullScore: 150 };
      if (code === "807" && schoolName === "华南理工大学") return { kind: "professional", builtin: "mechanics", name: "807 材料力学", code, fullScore: 150 };
      if (name.includes("数学")) { notes.push(`数学科目为 ${code} ${name}（院校自命题），已按数学一暂代`); return { kind: "math", variant: "math1", name: `${code} ${name}`, code, fullScore: 150 }; }
      return { kind: "professional", name: `${code} ${name}`, code, fullScore: 150 };
    });
    return { subjects, note: notes.join("；") };
  }

  function bindProgramSearch(dialog) {
    const input = dialog.querySelector("#programSearch");
    const results = dialog.querySelector("#programResults");
    let timer = null;
    function show(html) { results.innerHTML = html; results.hidden = false; }
    function renderSchools(list, q) {
      const hits = list.filter(x => x.name.includes(q) || x.dwdm.startsWith(q)).slice(0, 30);
      if (!hits.length) { show(`<p class="pf-hint">目录里没有匹配的学校，可以直接手动填写。</p>`); return; }
      show(hits.map(x => `<button type="button" class="pf-program" data-school="${esc(x.dwdm)}">
        <b>${esc(x.name)}</b><span>${esc(x.province)} · ${x.n} 个专业${x.syl ? " · 双一流" : ""}${x.zhx ? " · 自划线" : ""}</span></button>`).join(""));
      results.querySelectorAll("[data-school]").forEach(b => { b.onclick = () => openSchool(b.dataset.school); });
    }
    async function openSchool(dwdm) {
      show(`<p class="pf-hint">正在加载该校专业目录…</p>`);
      try {
        const school = await loadSchoolFile(dwdm);
        const progs = school.programs || [];
        show(`<button type="button" class="pf-program" data-back="1"><b>← 换个学校</b><span>${esc(school.name)} · 共 ${progs.length} 个专业</span></button>` +
          progs.map((p, i) => `<button type="button" class="pf-program" data-prog="${i}">
            <b>${esc(p.code)} ${esc(p.name)}</b><span>${esc(p.type || "")} · ${p.colleges.reduce((n, c) => n + c.dirs.length, 0)} 个方向</span></button>`).join(""));
        results.querySelector("[data-back]").onclick = () => { const q = input.value.trim(); if (q && catalogIndex) renderSchools(catalogIndex, q); };
        results.querySelectorAll("[data-prog]").forEach(b => { b.onclick = () => openProgram(school, progs[Number(b.dataset.prog)]); });
      } catch (e) { show(`<p class="pf-hint">该校目录加载失败，可以直接手动填写。</p>`); }
    }
    function openProgram(school, prog) {
      const variants = new Map();
      (prog.colleges || []).forEach(c => (c.dirs || []).forEach(d => {
        const key = c.name + "|" + d.m + "|" + JSON.stringify(d.s);
        if (!variants.has(key)) variants.set(key, { college: c.name, mode: d.m, subjects: d.s });
      }));
      const list = [...variants.values()];
      const applyVariant = v => {
        const mapped = mapCatalogSubjects(v.subjects, school.name);
        applyProgram({
          id: `cat-${school.dwdm}-${prog.code}`, school: school.name, college: v.college,
          majorCode: prog.code, majorName: prog.name, degreeType: prog.type, studyMode: v.mode,
          year: 2027, note: mapped.note, subjects: mapped.subjects,
        });
        results.hidden = true; input.value = "";
      };
      if (list.length === 1) { applyVariant(list[0]); return; }
      show(`<button type="button" class="pf-program" data-back2="1"><b>← 换个专业</b><span>${esc(prog.code)} ${esc(prog.name)} · 按学院与学习方式选一套考试科目</span></button>` +
        list.map((v, i) => `<button type="button" class="pf-program" data-var="${i}">
          <b>${esc(v.college)} · ${esc(v.mode)}</b><span>${v.subjects.map(x => esc(x[0]) + " " + esc(x[1])).join(" / ")}</span></button>`).join(""));
      results.querySelector("[data-back2]").onclick = () => openSchool(school.dwdm);
      results.querySelectorAll("[data-var]").forEach(b => { b.onclick = () => applyVariant(list[Number(b.dataset.var)]); });
    }
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = input.value.trim();
        if (!q) { results.hidden = true; return; }
        try {
          const list = await loadCatalogIndex();
          renderSchools(list, q);
        } catch (e) {
          try {
            const res = await fetch("/api/programs?q=" + encodeURIComponent(q), { credentials: "include" });
            const data = await res.json();
            const programs = data.programs || [];
            show(programs.length ? programs.map((p, i) => `<button type="button" class="pf-program" data-fb="${i}">
              <b>${esc(p.school)} · ${esc(p.majorCode)} ${esc(p.majorName)}</b>
              <span>${esc(p.college || "")} · ${esc(p.degreeType || "")} · ${p.year || ""}</span></button>`).join("")
              : `<p class="pf-hint">没有匹配的目录项，可以直接手动填写。</p>`);
            results.querySelectorAll("[data-fb]").forEach(b => { b.onclick = () => { applyProgram(programs[Number(b.dataset.fb)]); results.hidden = true; input.value = ""; }; });
          } catch (e2) { results.hidden = true; }
        }
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
    if (form.motto) form.motto.value = profile.motto || "";
    paintAvatar(profile);
    fillChips(profile);
    form.school.value = profile.school || "";
    form.majorCode.value = profile.majorCode || "";
    form.majorName.value = profile.majorName || "";
    form.examDate.value = profile.examDate || "";
    form.dailyHours.value = Math.round(((profile.dailyMinutes || 240) / 60) * 10) / 10;
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
      dailyMinutes: Math.max(30, Math.min(1440, Math.round((Number(form.dailyHours.value) || 4) * 60))),
      chronotype: form.chronotype.value,
      motto: form.motto ? form.motto.value.trim() : "",
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
      try {
        const mineRes = await fetch("/api/subjects", { credentials: "include" });
        const mine = await mineRes.json();
        const names = new Set(((mine.subjects || [])).map(x => x.name));
        for (const cs of payload.customSubjects) {
          const nm = (cs.code ? cs.code + " " + cs.name : cs.name).slice(0, 30);
          if (!names.has(nm) && !names.has(cs.name)) {
            await fetch("/api/subjects", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ name: nm }) });
          }
        }
      } catch (_) { /* 同步失败不影响档案保存 */ }
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
    if (profile && profile.avatarAt && btn.parentElement && !document.getElementById("topAvatar")) {
      const img = document.createElement("img");
      img.id = "topAvatar";
      img.className = "pf-top-avatar";
      img.alt = "我的头像";
      img.src = `/api/profile/avatar?v=${profile.avatarAt}`;
      img.onclick = () => openDialog(profile);
      btn.parentElement.insertBefore(img, btn);
    }
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

  function loadProfile() {
    if (window.__profilePromise) {
      return Promise.resolve(window.__profilePromise).then(data => (data && data.profile) || null).catch(() => null);
    }
    return fetch("/api/profile", { credentials: "include" })
      .then(res => (res.ok ? res.json() : null))
      .then(data => (data && data.profile) || null)
      .catch(() => null);
  }

  async function showWelcome() {
    let pending;
    try { pending = localStorage.getItem("atlas.welcome.pending"); } catch (e) { return false; }
    if (!pending) return false;
    try {
      const response = await fetch("/api/auth/me", { credentials: "include" });
      if (!response.ok) return false;
      const data = await response.json();
      if (!data.user || data.user.id !== pending) return false;
    } catch (e) { return false; }
    const dialog = document.createElement("dialog");
    dialog.id = "welcomeDialog";
    dialog.className = "profile-dialog";
    dialog.setAttribute("aria-labelledby", "welcomeTitle");
    dialog.innerHTML = `<div class="profile-card"><header class="profile-head"><div><b id="welcomeTitle">欢迎来到考研大观</b><span>用几步熟悉你的学习空间</span></div></header>
      <div class="profile-body"><ol class="welcome-steps">
      <li><b>设置档案</b>：点击首页「档案」，填写目标院校与考试科目，生成适合你的知识图谱。</li>
      <li><b>探索知识图谱</b>：选择科目、章节和知识点，阅读内容；点击知识点可进入相应练习并选择难度。</li>
      <li><b>开始刷题</b>：在「刷题」选择知识点练习、套卷或全真模考；套卷交卷后查看解析、评估和错题。</li>
      <li><b>积累资料</b>：通过「资料库」上传资料并整理个人题目，使用「笔记库」记录复习要点。</li>
      <li><b>练习英语</b>：在「词汇」复习和自测；需要帮助时可使用提示及相关 AI 指导。</li>
      </ol><p class="pf-hint">你可以随时返回首页继续学习，并通过反馈入口提出建议。</p></div>
      <footer class="profile-foot"><button type="button" class="btn ghost" data-dismiss>我是老手</button><button type="button" class="btn" data-dismiss>开始学习</button></footer></div>`;
    document.body.appendChild(dialog);
    const dismiss = () => { try { localStorage.removeItem("atlas.welcome.pending"); } catch (e) {} };
    dialog.addEventListener("close", dismiss);
    dialog.querySelectorAll("[data-dismiss]").forEach(button => button.addEventListener("click", () => { dismiss(); dialog.close(); }));
    dialog.showModal();
    return true;
  }

  async function boot() {
    const profile = await loadProfile();
    window.ATLAS_PROFILE = profile;
    window.__profileBoot = { hasProfile: !!profile, isDefault: !!(profile && profile.isDefault) };
    if (profile) applyProfile(profile);
    renderButton(profile || {});
    if (profile && location.hash === "#profile") setTimeout(() => openDialog(profile), 500);
    loadAtlas();
    const welcomeOpen = await showWelcome();
    if (profile && profile.isDefault) {
      showHint(profile);
      try {
        if (!welcomeOpen && !localStorage.getItem("atlas.profile.prompted")) {
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
