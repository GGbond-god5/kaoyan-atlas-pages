// 评委体验账号：一键登录、每次进入重置为一份完整的学习档案。
// 数据覆盖个人档案、错题/复习排期、词汇进度、目标分、收藏与错题本、站内消息、笔记和多次批改记录。
import { getDb, getUser } from './db.js';
import { ensureLayer1 } from './layer1.js';
import { ensurePlatform } from './platform.js';
import { saveProfile, getProfile } from './profile.js';
import { createNote, listNotes } from './notes.js';
import { randomHex } from './security.js';
import { DEMO_QUESTIONS } from './demo-questions.js';

export const DEMO_PHONE = '19900000000';
export const DEMO_UID = 'demo-atlas-2027';
export const DEMO_NICKNAME = '评委体验 · 2027';

const DAY = 86400000;
const HOUR = 3600000;
const QUESTION_BY_ID = new Map(DEMO_QUESTIONS.map(q => [q.id, q]));

const PRACTICE_WORK = {
  'math-01-kp-01-1': '由 0≤x−1≤2 得 1≤x≤3，由 0≤x+1≤2 得 −1≤x≤1，取交集得 {1}。',
  'math-01-kp-02-1': 'f 左极限 −1、右极限 1，所以不存在；g 左极限 0、右极限 +∞，也不存在。',
  'math-01-kp-03-1': '先把分子通分，再用等价无穷小替换 tan x 和 sin x。',
  'math-01-kp-04-1': '第一题取对数后洛必达；第二题先通分，再用泰勒展开到三阶。',
  'math-01-kp-05-1': '化成 e^{x ln x} 处理 1^∞，指数部分用洛必达。',
  'english-01-kp-01-1': 'subject to 受制于，account for 解释，take hold 扎根，give way to 让位。',
  'english-01-kp-02-1': 'practice 在这里是“做法、惯例”，不是“练习”。',
  'english-01-kp-03-1': '先拆前缀判断方向，再看上下文逻辑。',
  'mech-01-kp-01-1': '小变形假设是为了按变形前几何列平衡方程，线弹性范围内可以叠加。',
  'mech-01-kp-02-1': '截开、画内力、列平衡，再代胡克定律。',
  'mech-01-kp-03-1': '应力是内力集度，应变是单位长度变形，胡克定律 σ=Eε。',
  'pol-01-kp-01-1': '前者是唯物主义，后者是主观唯心主义，分歧在物质和意识谁是第一性。',
  'pol-01-kp-01-2': '人工智能没有社会关系基础，也不具备真正的自觉能动性。',
  'pol-01-kp-02-1': '实践具有直接现实性，能把主观认识转化为客观结果。',
};

const ATTEMPTS = [
  {
    id: 'demo-math-a',
    subject: 'math',
    mode: 'paper',
    title: '数学一 · 函数极限专项',
    daysAgo: 18,
    qids: ['math-01-kp-01-1', 'math-01-kp-02-1', 'math-01-kp-03-1', 'math-01-kp-04-1', 'math-01-kp-05-1'],
    max: [10, 10, 12, 12, 12],
    scores: [8, 7, 5, 7, 9],
  },
  {
    id: 'demo-english-a',
    subject: 'english',
    mode: 'diagnostic',
    title: '英语一 · 核心短语诊断',
    daysAgo: 12,
    qids: ['english-01-kp-01-1', 'english-01-kp-02-1', 'english-01-kp-03-1'],
    max: [10, 10, 10],
    scores: [9, 7, 6],
  },
  {
    id: 'demo-mech-a',
    subject: 'mechanics',
    mode: 'paper',
    title: '材料力学 · 拉压与变形',
    daysAgo: 8,
    qids: ['mech-01-kp-01-1', 'mech-01-kp-02-1', 'mech-01-kp-03-1'],
    max: [15, 20, 15],
    scores: [11, 12, 7],
  },
  {
    id: 'demo-pol-a',
    subject: 'politics',
    mode: 'ability',
    title: '政治 · 唯物论与认识论',
    daysAgo: 4,
    qids: ['pol-01-kp-01-1', 'pol-01-kp-01-2', 'pol-01-kp-02-1'],
    max: [10, 15, 15],
    scores: [7, 8, 11],
  },
  {
    id: 'demo-math-b',
    subject: 'math',
    mode: 'paper',
    title: '数学一 · 函数极限复测',
    daysAgo: 1,
    qids: ['math-01-kp-01-1', 'math-01-kp-02-1', 'math-01-kp-03-1', 'math-01-kp-04-1', 'math-01-kp-05-1'],
    max: [10, 10, 12, 12, 12],
    scores: [10, 9, 9, 11, 11],
  },
];

const WEAK_TEXT = {
  'math-01-kp-03-1': {
    comments: '通分方向正确，但直接对 tan x、sin x 做等价替换，低阶项相消后得到 0，是典型误区。',
    missing: '减法中不能分别替换，应先通分或展开到三阶。',
    suggestions: '遇到 tan x−sin x 先通分成 sin x(1−cos x)/(x³cos x)，再用 1−cos x ~ x²/2。',
  },
  'english-01-kp-02-1': {
    comments: '正确识别了 practice 的“做法”义，但原句搭配 the practice of doing 的说明不够完整。',
    missing: 'the practice of doing 的固定搭配。',
    suggestions: '把短语和原句一起记：the practice of doing sth 表示“做某事的做法/惯例”。',
  },
  'english-01-kp-03-1': {
    comments: '拆词根的方向判断基本正确，但没有回到上下文核对修饰对象。',
    missing: '上下文逻辑关系与修饰对象。',
    suggestions: '先定前缀方向，再判断该词修饰谁、前后分句是并列还是转折。',
  },
  'mech-01-kp-02-1': {
    comments: '计算步骤完整，轴力方向与变形协调条件的符号说明不够清楚。',
    missing: '轴力正负号与变形协调条件的说明。',
    suggestions: '画受力图时先标正方向，列变形协调方程前写清各段轴力的拉压性质。',
  },
  'mech-01-kp-03-1': {
    comments: '只写了应力应变的定义，没有把胡克定律和适用条件连起来。',
    missing: '胡克定律 σ=Eε 及其线弹性适用条件。',
    suggestions: '按“定义—关系—适用条件”三句话组织：应力是内力集度，应变是单位长度变形，线弹性下 σ=Eε。',
  },
  'pol-01-kp-01-1': {
    comments: '能指出两种观点对立，但“第一性”这一根本分歧表述不够准确。',
    missing: '物质与意识何者为第一性的标准表述。',
    suggestions: '先定性：前者唯物主义反映论，后者主观唯心主义；再落到物质第一性、意识第二性。',
  },
  'pol-01-kp-01-2': {
    comments: '回答了人工智能不能取代意识，但只从功能角度说明，缺少社会关系基础这一层。',
    missing: '意识的社会性、目的性与人工智能的模拟本质。',
    suggestions: '按“意识是人脑机能和社会实践产物—AI 只是功能模拟—AI 无社会关系和自觉能动性”作答。',
  },
};

const NOTES = [
  {
    chapter: 'math-01',
    title: '极限计算：先定类型，再选工具',
    type: '方法卡',
    markdown: `## 四步拆题\n\n1. 代入初值，判断是否未定式。\n2. 能通分/因式分解的先整理，再考虑等价无穷小。\n3. 加减结构不要分别替换，先通分或展开到足够阶。\n4. 1^∞、0·∞ 先取对数，化成 0/0 或 ∞/∞。\n\n> 易错：tan x−sin x 直接替换会得 0，正确结果是 1/2。\n\n记忆：**先整理结构，再谈替换**。`,
  },
  {
    chapter: 'math-01',
    title: '等价无穷小替换的边界',
    type: '错题整理',
    markdown: `## 什么时候不能直接换\n\n- 加减法中，低阶项可能相消，替换后阶数不够。\n- 乘除因子可以放心替换，但加减项要先合并。\n\n## 两道对照\n\n- \\((\\tan x-\\sin x)/x^3\\to 1/2\\)：先通分。\n- \\((1-\\cos x)/x^2\\to 1/2\\)：乘除结构，可直接换。\n\n复盘时把“为什么不能换”写出来，比只记结论有效。`,
  },
  {
    chapter: 'mech-01',
    title: '拉压杆变形题的三步检查',
    type: '方法卡',
    markdown: `## 三步检查\n\n1. **受力**：截开取段，轴力拉为正、压为负。\n2. **变形**：每段代 \\(\\Delta l=Fl/(EA)\\)，长度与刚度别混。\n3. **协调**：把各段变形和节点位移用几何关系连起来。\n\n> 符号错一次，后面全错；先画正方向再列式。`,
  },
  {
    chapter: 'pol-01',
    title: '马原选择题先定“第一性”',
    type: '背诵提纲',
    markdown: `## 一句话判断\n\n看到“物质与意识”先问：谁决定谁？\n\n- 物质决定意识 → 唯物主义\n- 意识决定物质 → 唯心主义\n- 存在就是被感知 → 主观唯心主义\n\n## 分析题模板\n\n原理定位 → 材料对应 → 方法论。物质决定意识，意识有能动反作用，所以既要一切从实际出发，也要重视精神力量。`,
  },
];

const demoState = () => {
  const now = Date.now();
  const touched = days => new Date(now - days * DAY).toISOString();
  const recent = days => now - days * DAY;

  const practiceRec = {};
  const wrongIds = new Set(['math-01-kp-03-1', 'english-01-kp-02-1', 'english-01-kp-03-1', 'mech-01-kp-02-1', 'mech-01-kp-03-1', 'pol-01-kp-01-1', 'pol-01-kp-01-2']);
  for (const a of ATTEMPTS) {
    const seenDays = a.daysAgo;
    a.qids.forEach((qid, i) => {
      const wrong = wrongIds.has(qid) && a.id !== 'demo-math-b' ? 1 : 0;
      const prev = practiceRec[qid] || { seen: 0, ok: 0, wrong: 0, last: 0 };
      practiceRec[qid] = {
        seen: prev.seen + 1,
        ok: prev.ok + (wrong ? 0 : 1),
        wrong: prev.wrong + wrong,
        last: Math.max(prev.last, recent(seenDays)),
      };
    });
  }

  const sched = {
    'math-01-kp-03-1': { s: 1, due: now - 3 * HOUR },
    'english-01-kp-02-1': { s: 0, due: now - 2 * HOUR },
    'english-01-kp-03-1': { s: 0, due: now - 1 * HOUR },
    'mech-01-kp-02-1': { s: 2, due: now + 2 * DAY },
    'mech-01-kp-03-1': { s: 0, due: now - 30 * 60000 },
    'pol-01-kp-01-1': { s: 1, due: now + DAY },
    'pol-01-kp-01-2': { s: 0, due: now - 4 * HOUR },
  };

  // 与前端 todayKey() 对齐：按北京时间取日期键
  const dayKey = offset => {
    const d = new Date(now + 8 * HOUR + offset * DAY);
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${d.getUTCFullYear()}-${m}-${dd}`;
  };

  return {
    practice: { rec: practiceRec },
    review: { sched },
    goals: { targets: { math: 120, english: 70, mechanics: 110, politics: 70 } },
    onboarding: { done: true, at: touched(30) },
    marks: {
      fav: { 'math-01-kp-05-1': recent(16), 'pol-01-kp-02-1': recent(3) },
      wb: {
        'math-01-kp-03-1': recent(18),
        'english-01-kp-02-1': recent(12),
        'english-01-kp-03-1': recent(12),
        'mech-01-kp-03-1': recent(8),
        'pol-01-kp-01-1': recent(4),
      },
    },
    vocab: {
      rec: {
        subject: { l: 5, d: now + 12 * DAY, seen: 8, ok: 8, w: 0 },
        practice: { l: 4, d: now + 6 * DAY, seen: 7, ok: 6, w: 1 },
        account: { l: 3, d: now + 3 * DAY, seen: 6, ok: 5, w: 1 },
        hold: { l: 2, d: now + DAY, seen: 4, ok: 3, w: 1 },
        yield: { l: 1, d: now - 2 * HOUR, seen: 3, ok: 2, w: 1 },
        sustain: { l: 4, d: now + 7 * DAY, seen: 6, ok: 6, w: 0 },
        advocate: { l: 2, d: now - HOUR, seen: 3, ok: 2, w: 1 },
        compromise: { l: 5, d: now + 15 * DAY, seen: 9, ok: 9, w: 0 },
        deteriorate: { l: 3, d: now + 2 * DAY, seen: 5, ok: 4, w: 1 },
        inevitable: { l: 4, d: now + 4 * DAY, seen: 6, ok: 6, w: 0 },
      },
      star: { inevitable: 1, deteriorate: 1, advocate: 1 },
      days: { [dayKey(0)]: 16, [dayKey(-1)]: 20, [dayKey(-2)]: 18, [dayKey(-3)]: 12, [dayKey(-4)]: 14 },
      tts: true,
    },
    inbox: {
      messages: [
        {
          id: 'gdemo-math-b',
          kind: 'grade',
          attemptId: 'demo-math-b',
          title: '数学一 · 函数极限复测',
          at: recent(1),
          read: false,
        },
        {
          id: 'gdemo-english-a',
          kind: 'grade',
          attemptId: 'demo-english-a',
          title: '英语一 · 核心短语诊断',
          at: recent(12),
          read: true,
        },
      ],
    },
  };
};

function resultFor(attempt, q, score, max) {
  const pct = max > 0 ? score / max : 0;
  const weak = pct < 0.75 ? WEAK_TEXT[q.id] : null;
  const level = pct >= 0.9 ? '优秀' : pct >= 0.75 ? '良好' : pct >= 0.6 ? '达标' : '需加强';
  const first = Math.min(max, Math.round(max * 0.4 * 2) / 2);
  const base = pct >= 0.9
    ? {
        comments: '要点完整，推导链清楚，结论正确。',
        missing: '',
        suggestions: '保持步骤书写，关键条件在代入前标注清楚。',
      }
    : pct >= 0.75
      ? {
          comments: '主体思路正确，个别关键步骤写得偏快，结论基本到位。',
          missing: '部分得分点的条件说明。',
          suggestions: '每个公式代入前写清适用条件，最后单独写结论句。',
        }
      : {
          comments: '关键结论方向正确，但中间推理有缺口，得分点覆盖不足。',
          missing: '核心原理与材料/条件的对应关系。',
          suggestions: '按“原理—代入—结论”三段重写一遍，再对照参考答案逐点核分。',
        };
  const text = weak ? { ...base, ...weak } : base;
  const dimension = {
    math: { 概念定位: { score: Math.round(score * 0.5 * 2) / 2, max: Math.round(max * 0.5 * 2) / 2 }, 运算与结论: { score: score - Math.round(score * 0.5 * 2) / 2, max: max - Math.round(max * 0.5 * 2) / 2 } },
    english: { 词义判断: { score: Math.round(score * 0.6 * 2) / 2, max: Math.round(max * 0.6 * 2) / 2 }, 语境与搭配: { score: score - Math.round(score * 0.6 * 2) / 2, max: max - Math.round(max * 0.6 * 2) / 2 } },
    mechanics: { 受力分析: { score: Math.round(score * 0.4 * 2) / 2, max: Math.round(max * 0.4 * 2) / 2 }, 公式与计算: { score: score - Math.round(score * 0.4 * 2) / 2, max: max - Math.round(max * 0.4 * 2) / 2 } },
    politics: { 原理定位: { score: Math.round(score * 0.5 * 2) / 2, max: Math.round(max * 0.5 * 2) / 2 }, 材料结合: { score: score - Math.round(score * 0.5 * 2) / 2, max: max - Math.round(max * 0.5 * 2) / 2 } },
  }[attempt.subject] || {};
  const dims = {};
  for (const [k, v] of Object.entries(dimension)) {
    dims[k] = { score: Math.max(0, Math.min(v.max, v.score)), max: v.max };
  }
  return {
    questionId: q.id,
    score,
    maxScore: max,
    maxScoreAssumed: false,
    level,
    comments: text.comments,
    missing: text.missing,
    suggestions: text.suggestions,
    revised: q.answer,
    transcript: '',
    breakdown: [
      { point: q.kpName, max: first, score: Math.round(score / max * first * 2) / 2, comment: '' },
      { point: '步骤与结论', max: max - first, score: score - Math.round(score / max * first * 2) / 2, comment: '' },
    ],
    dimensions: dims,
    grammar: [],
    upgrades: [],
    status: 'graded',
  };
}

function attemptRows() {
  const now = Date.now();
  const rows = [];
  for (const def of ATTEMPTS) {
    const at = now - def.daysAgo * DAY;
    const createdAt = new Date(at).toISOString();
    const questions = def.qids.map((qid, i) => ({ ...QUESTION_BY_ID.get(qid), maxScore: def.max[i], maxScoreAssumed: false }));
    const answers = {};
    for (const qid of def.qids) {
      answers[qid] = { work: PRACTICE_WORK[qid] || '', selected: [], image: '', images: [] };
    }
    const totalScore = def.scores.reduce((a, b) => a + b, 0);
    const totalMax = def.max.reduce((a, b) => a + b, 0);
    const raw = {
      id: def.id,
      subject: def.subject,
      mode: def.mode,
      title: def.title,
      questions,
      answers,
      results: {},
      status: 'graded',
      serverGrade: false,
      createdAt,
      completedAt: createdAt,
      score: totalScore,
      maxScore: totalMax,
      knownMaxScore: totalMax,
      rate: Math.round(totalScore / totalMax * 100) / 100,
    };
    rows.push({ attempt: raw, results: def.qids.map((qid, i) => resultFor(def, QUESTION_BY_ID.get(qid), def.scores[i], def.max[i])) });
  }
  return rows;
}

async function tryRun(db, sql, ...args) {
  try { await db.prepare(sql).bind(...args).run(); } catch { /* 表或列可能尚未创建 */ }
}

/** 每小时每 IP 的体验次数上限，防止被脚本反复重置数据库 */
export async function demoVisitAllowed(env, ip) {
  const db = await getDb(env);
  if (!db) return { ok: false, status: 503, error: '数据库未就绪，暂时无法进入体验账号' };
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS demo_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_demo_visits_ip ON demo_visits(ip, created_at)').run();
    const since = Date.now() - HOUR;
    const row = await db.prepare('SELECT COUNT(*) AS n, MIN(created_at) AS first FROM demo_visits WHERE ip = ? AND created_at > ?').bind(ip, since).first();
    const limit = Math.max(1, Number(env.DEMO_HOURLY_LIMIT || 20) || 20);
    if ((row?.n || 0) >= limit) {
      const retryAfter = Math.max(60, Math.ceil(((row.first || Date.now()) + HOUR - Date.now()) / 1000));
      return { ok: false, status: 429, error: '体验账号进入太频繁，请稍后再试', retryAfter };
    }
    await db.prepare('INSERT INTO demo_visits (ip, created_at) VALUES (?, ?)').bind(ip, Date.now()).run();
    await tryRun(db, 'DELETE FROM demo_visits WHERE created_at < ?', Date.now() - 7 * DAY);
    return { ok: true };
  } catch {
    return { ok: false, status: 503, error: '体验账号暂时不可用，请稍后再试' };
  }
}

/** 重置并返回体验账号的用户行；调用前需已通过 demoVisitAllowed */
export async function seedDemoAccount(env) {
  const db = await getDb(env);
  if (!db) throw new Error('数据库未就绪');
  await ensureLayer1(env);
  await ensurePlatform(env);
  // 先把 profile / notes 表建出来，后面才能安全清空
  await getProfile(env, DEMO_UID);
  await listNotes(env, DEMO_UID);

  const existing = await getUser(env, DEMO_PHONE);
  if (existing && existing.id && existing.id !== DEMO_UID) {
    throw new Error('体验手机号已被其他账号占用，暂时无法初始化');
  }
  const idClash = await db.prepare('SELECT phone FROM users WHERE id = ? AND phone != ?').bind(DEMO_UID, DEMO_PHONE).first();
  if (idClash) throw new Error('体验账号标识冲突，暂时无法初始化');

  const now = new Date().toISOString();
  const salt = randomHex(32);
  const hash = randomHex(32);
  if (!existing) {
    const createdAt = new Date(Date.now() - 76 * DAY).toISOString();
    await db.prepare(
      'INSERT INTO users (phone, id, nickname, salt, hash, iterations, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(DEMO_PHONE, DEMO_UID, DEMO_NICKNAME, salt, hash, 20000, createdAt, now).run();
  } else {
    await db.prepare(
      'UPDATE users SET nickname = ?, salt = ?, hash = ?, iterations = ?, last_login_at = ? WHERE phone = ?'
    ).bind(DEMO_NICKNAME, salt, hash, 20000, now, DEMO_PHONE).run();
  }
  await tryRun(db, "UPDATE users SET role = 'demo' WHERE phone = ?", DEMO_PHONE);
  await tryRun(db, 'UPDATE users SET banned = 0 WHERE phone = ?', DEMO_PHONE);
  await tryRun(db, 'DELETE FROM login_fail WHERE phone = ?', DEMO_PHONE);

  const clear = [
    'platform_files', 'platform_uploads', 'platform_drafts', 'platform_extractions', 'platform_questions',
    'platform_state', 'platform_attempts', 'platform_results', 'platform_coach',
    'platform_subjects', 'platform_wrongbook_exports', 'platform_shares',
  ];
  await db.batch(clear.map(t => db.prepare(`DELETE FROM ${t} WHERE uid = ?`).bind(DEMO_UID)));
  await tryRun(db, 'DELETE FROM user_notes WHERE uid = ?', DEMO_UID);
  await tryRun(db, 'DELETE FROM user_profiles WHERE uid = ?', DEMO_UID);

  await saveProfile(env, DEMO_UID, {
    school: '华南理工大学',
    majorCode: '085500',
    majorName: '机械',
    examDate: '2026-12-19',
    subjects: ['math', 'english', 'mechanics', 'politics'],
    variants: { math: 'math1', english: 'english1' },
    customSubjects: [],
    dailyMinutes: 240,
    chronotype: 'normal',
    motto: '把每一道错题，变成下一次的得分点。',
  });

  for (const note of NOTES) {
    try { await createNote(env, DEMO_UID, note); } catch { /* 单篇失败不影响整体体验 */ }
  }

  const state = demoState();
  const stateRows = Object.entries(state).map(([ns, data]) => ({ ns, data }));
  const attempts = attemptRows();
  const inserts = [];
  for (const { ns, data } of stateRows) {
    inserts.push(db.prepare('INSERT OR REPLACE INTO platform_state (uid, namespace, data, revision) VALUES (?, ?, ?, 1)').bind(DEMO_UID, ns, JSON.stringify(data)));
  }
  for (const row of attempts) {
    inserts.push(db.prepare('INSERT OR REPLACE INTO platform_attempts (uid, id, data) VALUES (?, ?, ?)').bind(DEMO_UID, row.attempt.id, JSON.stringify(row.attempt)));
    for (const result of row.results) {
      inserts.push(db.prepare('INSERT OR REPLACE INTO platform_results (uid, attempt_id, question_id, data) VALUES (?, ?, ?, ?)').bind(DEMO_UID, row.attempt.id, result.questionId, JSON.stringify(result)));
    }
  }
  await db.batch(inserts);

  const user = await getUser(env, DEMO_PHONE);
  if (!user) throw new Error('体验账号创建失败');
  return user;
}