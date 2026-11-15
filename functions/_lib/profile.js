// 用户考试档案：目标院校 / 专业 / 初试日期 / 科目 / 作息。
const TABLE = `CREATE TABLE IF NOT EXISTS user_profiles (
  uid TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

let ready = false;
async function db(env) {
  if (!env.DB) throw new Error('数据库未配置');
  if (!ready) {
    await env.DB.prepare(TABLE).run();
    ready = true;
  }
  return env.DB;
}

export const DEFAULT_PROFILE = {
  school: '华南理工大学',
  majorCode: '085500',
  majorName: '机械',
  examDate: '2026-12-19',
  subjects: ['math', 'english', 'mechanics', 'politics'],
  variants: { math: 'math1', english: 'english1' },
  customSubjects: [],
  dailyMinutes: 240,
  chronotype: 'normal',
  motto: '',
  avatarAt: 0,
  avatarType: '',
};

const SUBJECT_IDS = new Set(['math', 'english', 'mechanics', 'politics']);

export async function getProfile(env, uid) {
  const database = await db(env);
  const row = await database.prepare('SELECT data FROM user_profiles WHERE uid = ?').bind(uid).first();
  if (!row) return { ...DEFAULT_PROFILE, isDefault: true };
  try {
    return { ...DEFAULT_PROFILE, ...JSON.parse(row.data), isDefault: false };
  } catch {
    return { ...DEFAULT_PROFILE, isDefault: true };
  }
}

export function normalize(input) {
  const value = input && typeof input === 'object' ? input : {};
  const text = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  const school = text(value.school, 40) || DEFAULT_PROFILE.school;
  const majorCode = text(value.majorCode, 12) || DEFAULT_PROFILE.majorCode;
  const majorName = text(value.majorName, 30) || DEFAULT_PROFILE.majorName;
  const examDate = /^\d{4}-\d{2}-\d{2}$/.test(text(value.examDate, 10)) ? text(value.examDate, 10) : DEFAULT_PROFILE.examDate;
  const subjects = Array.isArray(value.subjects)
    ? [...new Set(value.subjects.filter(s => SUBJECT_IDS.has(s)))]
    : DEFAULT_PROFILE.subjects.slice();
  const customSubjects = Array.isArray(value.customSubjects)
    ? value.customSubjects.slice(0, 3).map(c => {
        const item = c && typeof c === 'object' ? c : {};
        const name = text(item.name, 40);
        if (!name) return null;
        const code = text(item.code, 12);
        const score = Number(item.fullScore);
        const id = /^custom-[a-z0-9-]{4,}$/i.test(text(item.id, 40)) ? text(item.id, 40) : `custom-${crypto.randomUUID().slice(0, 8)}`;
        return { id, name, code, fullScore: Number.isFinite(score) ? Math.min(300, Math.max(50, Math.round(score))) : 150 };
      }).filter(Boolean)
    : [];
  const minutes = Number(value.dailyMinutes);
  const dailyMinutes = Number.isFinite(minutes) ? Math.min(900, Math.max(30, Math.round(minutes))) : DEFAULT_PROFILE.dailyMinutes;
  const chronotype = ['morning', 'normal', 'night'].includes(value.chronotype) ? value.chronotype : DEFAULT_PROFILE.chronotype;
  const motto = text(value.motto, 60);
  const variants = value.variants && typeof value.variants === 'object' ? value.variants : {};
  const mathVariant = ['math1', 'math2', 'math3'].includes(variants.math) ? variants.math : DEFAULT_PROFILE.variants.math;
  const englishVariant = ['english1', 'english2'].includes(variants.english) ? variants.english : DEFAULT_PROFILE.variants.english;
  return { school, majorCode, majorName, examDate, subjects: subjects.length ? subjects : DEFAULT_PROFILE.subjects.slice(), variants: { math: mathVariant, english: englishVariant }, customSubjects, dailyMinutes, chronotype, motto };
}

async function upsert(env, uid, profile) {
  const database = await db(env);
  const now = new Date().toISOString();
  await database
    .prepare(`INSERT INTO user_profiles (uid, data, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(uid) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
    .bind(uid, JSON.stringify(profile), now)
    .run();
  return { ...profile, updatedAt: now, isDefault: false };
}

export async function saveProfile(env, uid, input) {
  const profile = normalize(input);
  // 头像元数据由头像接口单独维护，普通保存时保留不覆盖
  const current = await getProfile(env, uid);
  profile.avatarAt = current.avatarAt || 0;
  profile.avatarType = current.avatarType || '';
  return upsert(env, uid, profile);
}

export async function setAvatarMeta(env, uid, avatarAt, avatarType) {
  const current = await getProfile(env, uid);
  const profile = normalize(current);
  profile.avatarAt = avatarAt || 0;
  profile.avatarType = avatarType || '';
  return upsert(env, uid, profile);
}
